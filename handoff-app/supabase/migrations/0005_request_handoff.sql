-- ============================================================================
-- 0005_request_handoff.sql
-- request_handoff(): creates a new BORROW handoff row and decides, from
-- items.borrow_policy / items.sublend_policy and the unit's current holder,
-- who (if anyone) needs to approve before it moves to APPROVED.
--
--   Owner has it, borrow_policy=OPEN            -> auto-approved, no one asked
--   Owner has it, borrow_policy=OWNER_APPROVAL   -> owner approves
--   Holder B has it, sublend_policy=FORBIDDEN    -> rejected outright
--   Holder B has it, sublend_policy=ALLOWED      -> only B approves
--   Holder B has it, sublend_policy=OWNER_APPROVAL -> BOTH B and owner approve
-- ============================================================================

create or replace function request_handoff(
  p_item_unit_id uuid,
  p_requested_due_at timestamptz default null
)
returns handoffs
language plpgsql
security definer
set search_path = public
as $$
declare
  caller uuid := auth.uid();
  unit item_units%rowtype;
  it items%rowtype;
  depth integer := 1;
  need_holder boolean := false;
  need_owner boolean := false;
  h handoffs%rowtype;
  new_code text;
begin
  select * into unit from item_units where id = p_item_unit_id for update;
  if not found then raise exception 'item not found'; end if;
  select * into it from items where id = unit.item_id;

  if unit.status <> 'AVAILABLE' and unit.current_holder_id is null then
    raise exception 'not available';
  end if;
  if caller = coalesce(unit.current_holder_id, it.owner_id) then
    raise exception 'you already have this';
  end if;
  if exists (
    select 1 from handoffs
    where item_unit_id = p_item_unit_id
      and state in ('REQUESTED','APPROVED','HANDED_OVER','RETURN_INITIATED')
  ) then
    raise exception 'already has a pending handoff';
  end if;

  if unit.current_holder_id is null then
    -- coming straight from the owner
    depth := 1;
    if it.borrow_policy = 'OWNER_APPROVAL' then
      need_owner := true;
    end if;
  else
    -- sublend: find the depth of the handoff that put it in the current holder's hands
    select coalesce(max(chain_depth), 1) into depth
      from handoffs where item_unit_id = p_item_unit_id and state in ('RECEIVED','AUTO_RECEIVED');
    depth := depth + 1;
    if depth > 4 then
      raise exception 'chain too long — item must return to the owner first';
    end if;
    if it.sublend_policy = 'FORBIDDEN' then
      raise exception 'this item must come back to the owner between borrows';
    elsif it.sublend_policy = 'OWNER_APPROVAL' then
      need_holder := true;
      need_owner := true;
    elsif it.sublend_policy = 'ALLOWED' then
      need_holder := true;
    end if;
  end if;

  insert into handoffs (
    item_unit_id, kind, chain_depth, from_user_id, to_user_id, requested_by,
    state, needs_holder_approval, needs_owner_approval, due_at
  ) values (
    p_item_unit_id, 'BORROW', depth, unit.current_holder_id, caller, caller,
    'REQUESTED', need_holder, need_owner,
    coalesce(p_requested_due_at, now() + make_interval(days => coalesce(it.max_loan_days, 7)))
  ) returning * into h;

  -- nobody needs to approve -> OPEN policy, mint the code and go straight to APPROVED.
  -- (Mirrors the auto-advance block inside advance_handoff(); duplicated here rather
  -- than calling it with a fake action, so advance_handoff's action set stays exhaustive.)
  if not need_holder and not need_owner then
    new_code := lpad(floor(random() * 10000)::text, 4, '0');
    update handoffs
      set state = 'APPROVED', code_hash = crypt(new_code, gen_salt('bf')), updated_at = now()
      where id = h.id returning * into h;
  end if;

  return h;
end;
$$;
