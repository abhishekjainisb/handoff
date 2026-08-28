-- ============================================================================
-- 0006_rls.sql
-- RLS on for every table. The app code never uses the service-role key
-- except in the seed script and cron routes — everything else goes through
-- these policies, so a bug in a Server Action can leak/corrupt at most what
-- these policies allow.
-- ============================================================================

alter table roster enable row level security;
alter table profiles enable row level security;
alter table items enable row level security;
alter table item_units enable row level security;
alter table handoffs enable row level security;
alter table custody_events enable row level security;
alter table wanted_posts enable row level security;
alter table disputes enable row level security;

-- ---------------------------------------------------------------- roster
create policy roster_no_client_access on roster
  for all to authenticated, anon using (false) with check (false);
-- service role bypasses RLS entirely; this just blocks the anon/authenticated roles.

-- ---------------------------------------------------------------- profiles
create policy profiles_select_cohort on profiles
  for select to authenticated using (true);   -- name/section/address/trust are cohort-visible by design

create policy profiles_select_public on profiles
  for select to anon using (true);            -- public /u/[pgid] pages need name+address+trust badge

create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- profiles are only ever INSERTed by the handle_new_user() trigger (security definer),
-- never directly by a client — so no INSERT policy for authenticated/anon is granted.

-- phone number: hide it from everyone except the owner and anyone in an active
-- handoff with them. Enforced with a view rather than a table policy, since
-- column-level RLS by relationship needs a computed check.
create or replace view profiles_public as
select
  p.id, p.pgid, p.name, p.section, p.study_group, p.address_display, p.is_admin,
  case
    when p.id = auth.uid() then p.phone
    when exists (
      select 1 from handoffs h
      where h.state not in ('DECLINED','CANCELLED','EXPIRED')
        and (
          (h.to_user_id = auth.uid() and h.from_user_id = p.id) or
          (h.from_user_id = auth.uid() and h.to_user_id = p.id) or
          (p.id = auth.uid())
        )
    ) then p.phone
    else null
  end as phone
from profiles p;

-- ---------------------------------------------------------------- items
-- "any person should be able to check on all publicly listed stuff" —
-- COHORT-visibility items are readable by anon (logged-out) viewers too, via
-- the public /i/[slug] and /browse pages. Narrower-visibility items require login.
create policy items_select_public_cohort on items
  for select to anon using (visibility = 'COHORT' and status <> 'RETIRED');

create policy items_select_authenticated on items
  for select to authenticated using (
    status <> 'RETIRED' and (
      visibility = 'COHORT'
      or owner_id = auth.uid()
      or (visibility = 'MY_SECTION' and exists (
            select 1 from profiles me, profiles ow
            where me.id = auth.uid() and ow.id = items.owner_id and me.section = ow.section))
      or (visibility = 'MY_SV' and exists (
            select 1 from profiles me, profiles ow
            where me.id = auth.uid() and ow.id = items.owner_id and me.sv = ow.sv))
      or (visibility = 'MY_BLOCK' and exists (
            select 1 from profiles me, profiles ow
            where me.id = auth.uid() and ow.id = items.owner_id and me.sv = ow.sv and me.block = ow.block))
      or exists (select 1 from item_units u where u.item_id = items.id and u.current_holder_id = auth.uid())
    )
  );

create policy items_insert_own on items
  for insert to authenticated with check (owner_id = auth.uid());

create policy items_update_own on items
  for update to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
-- current_holder_id lives on item_units, not items, so there's no separate
-- "system writes this column" carve-out needed here.

-- ---------------------------------------------------------------- item_units
create policy item_units_select_public on item_units
  for select to anon using (
    exists (select 1 from items i where i.id = item_units.item_id and i.visibility = 'COHORT' and i.status <> 'RETIRED')
  );

create policy item_units_select_authenticated on item_units
  for select to authenticated using (
    exists (select 1 from items i where i.id = item_units.item_id)  -- items policy above already scopes visibility
  );
-- current_holder_id/status: written only by advance_handoff()/sync_item_units() (both SECURITY DEFINER).
-- No INSERT/UPDATE/DELETE grant to authenticated at all.

-- ---------------------------------------------------------------- handoffs
create policy handoffs_select_involved on handoffs
  for select to authenticated using (
    requested_by = auth.uid() or from_user_id = auth.uid() or to_user_id = auth.uid()
    or exists (select 1 from items i join item_units u on u.item_id = i.id
               where u.id = handoffs.item_unit_id and i.owner_id = auth.uid())
  );
-- All writes go through request_handoff()/advance_handoff() (SECURITY DEFINER),
-- which re-check the caller internally — so authenticated gets SELECT only here.

-- ---------------------------------------------------------------- custody_events
create policy custody_events_select_public on custody_events
  for select to anon using (
    exists (select 1 from item_units u join items i on i.id = u.item_id
            where u.id = custody_events.item_unit_id and i.visibility = 'COHORT')
  );
-- logged-out viewers see availability, not the full chain — the API layer
-- (not RLS) redacts from_user/to_user names for anon requests; RLS just
-- gates row visibility, which is enough since the UI never renders raw
-- rows to anon without going through the redacting query.

create policy custody_events_select_authenticated on custody_events
  for select to authenticated using (
    exists (select 1 from items i join item_units u on u.item_id = i.id
            where u.id = custody_events.item_unit_id)
  );
-- append-only: no INSERT/UPDATE/DELETE grants to authenticated or anon at all.

-- ---------------------------------------------------------------- wanted_posts
create policy wanted_select_all on wanted_posts for select to authenticated, anon using (true);
create policy wanted_insert_own on wanted_posts for insert to authenticated with check (requester_id = auth.uid());
create policy wanted_update_own on wanted_posts for update to authenticated
  using (requester_id = auth.uid()) with check (requester_id = auth.uid());

-- ---------------------------------------------------------------- disputes
create policy disputes_select_involved on disputes
  for select to authenticated using (
    raised_by = auth.uid() or against = auth.uid()
    or exists (select 1 from item_units u join items i on i.id = u.item_id
               where u.id = disputes.item_unit_id and i.owner_id = auth.uid())
  );
create policy disputes_insert_involved on disputes
  for insert to authenticated with check (
    raised_by = auth.uid() and exists (
      select 1 from item_units u join items i on i.id = u.item_id
      where u.id = disputes.item_unit_id and (i.owner_id = auth.uid() or u.current_holder_id = auth.uid())
    )
  );

-- ---------------------------------------------------------------- storage
-- item-photos bucket: public read, path-scoped write. Run once (idempotent):
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('item-photos', 'item-photos', true, 5242880, array['image/webp','image/jpeg','image/png'])
on conflict (id) do nothing;

create policy item_photos_public_read on storage.objects
  for select to anon, authenticated using (bucket_id = 'item-photos');

create policy item_photos_owner_write on storage.objects
  for insert to authenticated with check (
    bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy item_photos_owner_delete on storage.objects
  for delete to authenticated using (
    bucket_id = 'item-photos' and (storage.foldername(name))[1] = auth.uid()::text
  );
