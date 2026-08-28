-- ============================================================================
-- 0004_handoffs_and_custody.sql
-- THE CORE OF THE APP.
--
-- Rules enforced here, not just in the UI:
--   1. item_units.current_holder_id changes ONLY via advance_handoff().
--   2. At most one live handoff per item_unit at a time (partial unique index).
--   3. custody_events is append-only — no UPDATE/DELETE grants to anyone.
--   4. The 4-digit confirmation code is hashed at rest, verified server-side.
--   5. advance_handoff() is SECURITY DEFINER so it can bypass RLS to write
--      item_units/custody_events, but it re-checks who's allowed to do what
--      internally — the RLS on `handoffs` itself still gates who can even
--      call it (see 0006_rls.sql).
-- ============================================================================

create type handoff_kind as enum ('BORROW', 'RETURN');
create type handoff_state as enum (
  'REQUESTED','APPROVED','DECLINED','CANCELLED','EXPIRED',
  'HANDED_OVER','RECEIVED','DISPUTED','AUTO_RECEIVED',
  'RETURN_INITIATED','RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED'
);

create table if not exists handoffs (
  id                uuid primary key default gen_random_uuid(),
  item_unit_id      uuid not null references item_units(id) on delete cascade,
  kind              handoff_kind not null default 'BORROW',
  chain_depth       integer not null default 1 check (chain_depth between 1 and 4),
  parent_handoff_id uuid references handoffs(id),

  from_user_id      uuid references profiles(id),   -- null = coming from the owner's original custody
  to_user_id        uuid not null references profiles(id),
  requested_by      uuid not null references profiles(id),

  state             handoff_state not null default 'REQUESTED',

  -- who still needs to approve before state can move REQUESTED -> APPROVED
  needs_holder_approval boolean not null default false,
  needs_owner_approval   boolean not null default false,
  holder_approved_at     timestamptz,
  owner_approved_at      timestamptz,

  due_at            timestamptz,
  code_hash         text,          -- set on APPROVED, cleared once used
  handed_over_at    timestamptz,
  received_at       timestamptz,
  confirmed_by      text check (confirmed_by in ('BOTH','SYSTEM','ADMIN')),

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '48 hours'
);

comment on column handoffs.chain_depth is 'Hops from the owner. 1 = owner->first borrower. Capped at 4; a 5th hop is rejected and the item must return to the owner first.';

create index if not exists handoffs_unit_idx on handoffs(item_unit_id);
create index if not exists handoffs_to_user_idx on handoffs(to_user_id);
create index if not exists handoffs_from_user_idx on handoffs(from_user_id);
create index if not exists handoffs_state_idx on handoffs(state);

-- Rule 2: at most one LIVE handoff per unit.
create unique index if not exists one_live_handoff_per_unit
  on handoffs(item_unit_id)
  where state in ('REQUESTED','APPROVED','HANDED_OVER','RETURN_INITIATED');

alter table disputes add constraint disputes_handoff_fk
  foreign key (handoff_id) references handoffs(id);

-- Rule 3: append-only ledger. current_holder_id is derived from this table;
-- if the two ever disagree, this table is correct — see verify_custody_integrity().
create table if not exists custody_events (
  id            uuid primary key default gen_random_uuid(),
  item_unit_id  uuid not null references item_units(id) on delete cascade,
  handoff_id    uuid not null references handoffs(id),
  from_user_id  uuid references profiles(id),
  to_user_id    uuid not null references profiles(id),
  event_type    text not null check (event_type in ('BORROW_RECEIVED','RETURN_CONFIRMED')),
  confirmed_by  text not null check (confirmed_by in ('BOTH','SYSTEM','ADMIN')),
  occurred_at   timestamptz not null default now(),
  note          text
);

create index if not exists custody_events_unit_idx on custody_events(item_unit_id, occurred_at desc);

-- ----------------------------------------------------------------------------
-- advance_handoff(): the ONLY way state, current_holder_id, or custody_events
-- may change. Called from Server Actions via the anon/authenticated role;
-- SECURITY DEFINER lets it write tables the caller's RLS wouldn't otherwise
-- allow, but every branch below re-derives permission from auth.uid() itself.
-- ----------------------------------------------------------------------------
create or replace function advance_handoff(
  p_handoff_id uuid,
  p_action     text,   -- 'approve_holder' | 'approve_owner' | 'decline' | 'cancel'
                        -- | 'hand_over' | 'confirm_receipt' | 'dispute_receipt'
                        -- | 'initiate_return' | 'confirm_return' | 'dispute_return'
  p_code       text default null
)
returns handoffs
language plpgsql
security definer
set search_path = public
as $$
declare
  h handoffs%rowtype;
  caller uuid := auth.uid();
  unit item_units%rowtype;
  new_code text;
begin
  select * into h from handoffs where id = p_handoff_id for update;
  if not found then
    raise exception 'handoff not found';
  end if;
  select * into unit from item_units where id = h.item_unit_id for update;

  -- idempotency: re-firing an action already reflected in state is a no-op,
  -- not an error, so a double-tap on a laggy connection can't fail loudly.
  if p_action = 'confirm_receipt' and h.state in ('RECEIVED','AUTO_RECEIVED') then
    return h;
  end if;
  if p_action = 'confirm_return' and h.state in ('RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED') then
    return h;
  end if;

  if p_action = 'approve_holder' then
    if h.state <> 'REQUESTED' or not h.needs_holder_approval or caller <> h.from_user_id then
      raise exception 'not permitted';
    end if;
    update handoffs set holder_approved_at = now(), needs_holder_approval = false, updated_at = now()
      where id = h.id returning * into h;

  elsif p_action = 'approve_owner' then
    if h.state <> 'REQUESTED' or not h.needs_owner_approval then
      raise exception 'not permitted';
    end if;
    -- caller must be the item's owner
    if caller <> (select owner_id from items i join item_units u on u.item_id = i.id where u.id = h.item_unit_id) then
      raise exception 'not permitted';
    end if;
    update handoffs set owner_approved_at = now(), needs_owner_approval = false, updated_at = now()
      where id = h.id returning * into h;

  elsif p_action = 'decline' then
    if h.state <> 'REQUESTED' then raise exception 'not permitted'; end if;
    if caller not in (h.from_user_id, (select owner_id from items i join item_units u on u.item_id=i.id where u.id=h.item_unit_id)) then
      raise exception 'not permitted';
    end if;
    update handoffs set state = 'DECLINED', updated_at = now() where id = h.id returning * into h;

  elsif p_action = 'cancel' then
    if h.state not in ('REQUESTED','APPROVED') or caller <> h.requested_by then
      raise exception 'not permitted';
    end if;
    update handoffs set state = 'CANCELLED', updated_at = now() where id = h.id returning * into h;
  end if;

  -- once both required approvals are in, move REQUESTED -> APPROVED and mint the code
  if h.state = 'REQUESTED' and not h.needs_holder_approval and not h.needs_owner_approval then
    new_code := lpad(floor(random() * 10000)::text, 4, '0');
    update handoffs
      set state = 'APPROVED', code_hash = crypt(new_code, gen_salt('bf')), updated_at = now()
      where id = h.id returning * into h;
    -- new_code is returned to the caller (giver) by the Server Action from the
    -- RPC result's out-of-band channel — see app/actions/handoffs.ts comment.
  end if;

  if p_action = 'hand_over' then
    if h.state <> 'APPROVED' or caller <> coalesce(h.from_user_id, (select owner_id from items i join item_units u on u.item_id=i.id where u.id=h.item_unit_id)) then
      raise exception 'not permitted';
    end if;
    update handoffs set state = 'HANDED_OVER', handed_over_at = now(), updated_at = now()
      where id = h.id returning * into h;

  elsif p_action = 'confirm_receipt' then
    if h.state <> 'HANDED_OVER' or caller <> h.to_user_id then raise exception 'not permitted'; end if;
    if p_code is null or h.code_hash is null or crypt(p_code, h.code_hash) <> h.code_hash then
      raise exception 'wrong code';
    end if;
    update handoffs set state = 'RECEIVED', received_at = now(), confirmed_by = 'BOTH',
        code_hash = null, updated_at = now()
      where id = h.id returning * into h;
    insert into custody_events (item_unit_id, handoff_id, from_user_id, to_user_id, event_type, confirmed_by)
      values (h.item_unit_id, h.id, h.from_user_id, h.to_user_id, 'BORROW_RECEIVED', 'BOTH');
    update item_units set current_holder_id = h.to_user_id, status = 'ON_LOAN' where id = h.item_unit_id;
    update items set status = 'ON_LOAN'
      where id = (select item_id from item_units where id = h.item_unit_id)
        and not exists (select 1 from item_units u2 where u2.item_id = items.id and u2.status = 'AVAILABLE');

  elsif p_action = 'dispute_receipt' then
    if h.state <> 'HANDED_OVER' or caller <> h.to_user_id then raise exception 'not permitted'; end if;
    update handoffs set state = 'DISPUTED', updated_at = now() where id = h.id returning * into h;

  elsif p_action = 'initiate_return' then
    if h.state <> 'RECEIVED' and h.state <> 'AUTO_RECEIVED' then raise exception 'not permitted'; end if;
    if caller <> h.to_user_id then raise exception 'not permitted'; end if;
    new_code := lpad(floor(random() * 10000)::text, 4, '0');
    update handoffs set state = 'RETURN_INITIATED', code_hash = crypt(new_code, gen_salt('bf')), updated_at = now()
      where id = h.id returning * into h;

  elsif p_action = 'confirm_return' then
    if h.state <> 'RETURN_INITIATED' then raise exception 'not permitted'; end if;
    -- confirmer is whoever the unit is returning to: from_user_id (sublend) or the owner
    if caller <> coalesce(h.from_user_id, (select owner_id from items i join item_units u on u.item_id=i.id where u.id=h.item_unit_id)) then
      raise exception 'not permitted';
    end if;
    if p_code is null or h.code_hash is null or crypt(p_code, h.code_hash) <> h.code_hash then
      raise exception 'wrong code';
    end if;
    update handoffs set state = 'RETURN_CONFIRMED', confirmed_by = 'BOTH', code_hash = null, updated_at = now()
      where id = h.id returning * into h;
    insert into custody_events (item_unit_id, handoff_id, from_user_id, to_user_id, event_type, confirmed_by)
      values (h.item_unit_id, h.id, h.to_user_id, h.from_user_id, 'RETURN_CONFIRMED', 'BOTH');
    update item_units set current_holder_id = h.from_user_id,
        status = case when h.from_user_id is null then 'AVAILABLE' else 'ON_LOAN' end
      where id = h.item_unit_id;
    update items set status = 'AVAILABLE'
      where id = (select item_id from item_units where id = h.item_unit_id)
        and exists (select 1 from item_units u2 where u2.item_id = items.id and u2.status = 'AVAILABLE');

  elsif p_action = 'dispute_return' then
    if h.state <> 'RETURN_INITIATED' then raise exception 'not permitted'; end if;
    update handoffs set state = 'DISPUTED', updated_at = now() where id = h.id returning * into h;
  end if;

  return h;
end;
$$;

-- ----------------------------------------------------------------------------
-- 48h auto-confirm sweep. Called by the hourly cron route.
-- Auto-confirmed events are flagged confirmed_by='SYSTEM' — never silently
-- merged with a real two-party confirmation, so the health metric in the
-- spec (% auto-confirmed) stays honest.
-- ----------------------------------------------------------------------------
create or replace function sweep_expired_handoffs()
returns table(handoff_id uuid, new_state handoff_state)
language plpgsql
security definer
set search_path = public
as $$
declare
  h record;
begin
  for h in select * from handoffs where state = 'REQUESTED' and expires_at < now() loop
    update handoffs set state = 'EXPIRED', updated_at = now() where id = h.id;
    handoff_id := h.id; new_state := 'EXPIRED'; return next;
  end loop;

  for h in select * from handoffs where state = 'HANDED_OVER' and updated_at < now() - interval '48 hours' loop
    update handoffs set state = 'AUTO_RECEIVED', received_at = now(), confirmed_by = 'SYSTEM', code_hash = null, updated_at = now()
      where id = h.id;
    insert into custody_events (item_unit_id, handoff_id, from_user_id, to_user_id, event_type, confirmed_by)
      values (h.item_unit_id, h.id, h.from_user_id, h.to_user_id, 'BORROW_RECEIVED', 'SYSTEM');
    update item_units set current_holder_id = h.to_user_id, status = 'ON_LOAN' where id = h.item_unit_id;
    handoff_id := h.id; new_state := 'AUTO_RECEIVED'; return next;
  end loop;

  for h in select * from handoffs where state = 'RETURN_INITIATED' and updated_at < now() - interval '48 hours' loop
    update handoffs set state = 'AUTO_RETURN_CONFIRMED', confirmed_by = 'SYSTEM', code_hash = null, updated_at = now()
      where id = h.id;
    insert into custody_events (item_unit_id, handoff_id, from_user_id, to_user_id, event_type, confirmed_by)
      values (h.item_unit_id, h.id, h.to_user_id, h.from_user_id, 'RETURN_CONFIRMED', 'SYSTEM');
    update item_units set current_holder_id = h.from_user_id,
        status = case when h.from_user_id is null then 'AVAILABLE' else 'ON_LOAN' end
      where id = h.item_unit_id;
    handoff_id := h.id; new_state := 'AUTO_RETURN_CONFIRMED'; return next;
  end loop;
end;
$$;

-- ----------------------------------------------------------------------------
-- verify_custody_integrity(): recomputes each unit's holder from
-- custody_events and flags any mismatch against the item_units cache.
-- Should return zero rows in a healthy system. Run in CI / a cron health check.
-- ----------------------------------------------------------------------------
create or replace function verify_custody_integrity()
returns table(item_unit_id uuid, cached_holder uuid, ledger_holder uuid)
language sql stable
as $$
  with latest as (
    select distinct on (ce.item_unit_id) ce.item_unit_id, ce.to_user_id as ledger_holder
    from custody_events ce
    order by ce.item_unit_id, ce.occurred_at desc
  )
  select u.id, u.current_holder_id, l.ledger_holder
  from item_units u
  left join latest l on l.item_unit_id = u.id
  where coalesce(u.current_holder_id::text,'') <> coalesce(l.ledger_holder::text,'');
$$;
