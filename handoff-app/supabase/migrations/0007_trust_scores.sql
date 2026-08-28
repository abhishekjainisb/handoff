-- ============================================================================
-- 0007_trust_scores.sql
-- Computed on read (cheap enough at 420 users / a few thousand handoffs;
-- revisit as a materialized view refreshed by cron if it ever isn't).
-- ============================================================================

create or replace view trust_scores as
with loans as (
  select
    h.to_user_id as user_id,
    count(*) filter (where h.state in ('RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED')) as loans_completed,
    count(*) filter (where h.state in ('RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED')
                        and h.received_at is not null and h.due_at is not null
                        and h.updated_at <= h.due_at) as on_time_returns,
    count(*) filter (where h.state in ('RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED')
                        and h.due_at is not null and h.updated_at > h.due_at) as late_returns,
    avg(greatest(extract(epoch from (h.updated_at - h.due_at)) / 86400, 0))
      filter (where h.state in ('RETURN_CONFIRMED','AUTO_RETURN_CONFIRMED') and h.due_at is not null) as avg_days_late,
    count(*) filter (where h.confirmed_by = 'SYSTEM') as unconfirmed_handoffs
  from handoffs h
  group by h.to_user_id
),
owned as (
  select owner_id as user_id, count(*) as items_owned
  from items group by owner_id
),
held as (
  select current_holder_id as user_id, count(*) as items_currently_held
  from item_units where current_holder_id is not null group by current_holder_id
),
open_disp as (
  select against as user_id, count(*) as open_disputes
  from disputes where status = 'OPEN' and against is not null group by against
)
select
  p.id as user_id,
  coalesce(l.loans_completed, 0) as loans_completed,
  coalesce(l.on_time_returns, 0) as on_time_returns,
  coalesce(l.late_returns, 0) as late_returns,
  round(coalesce(l.avg_days_late, 0)::numeric, 1) as avg_days_late,
  coalesce(o.items_owned, 0) as items_owned,
  coalesce(h.items_currently_held, 0) as items_currently_held,
  coalesce(l.unconfirmed_handoffs, 0) as unconfirmed_handoffs,
  coalesce(d.open_disputes, 0) as open_disputes,
  case
    when coalesce(d.open_disputes, 0) > 0 then 'DISPUTE'
    when coalesce(l.loans_completed, 0) < 3 then 'NEW'
    when coalesce(l.late_returns, 0) >= 2 then 'SLOW_RETURNER'
    when coalesce(l.loans_completed, 0) >= 5
      and coalesce(l.on_time_returns, 0)::float / nullif(l.loans_completed, 0) >= 0.9 then 'RELIABLE'
    else 'NEUTRAL'
  end as badge
from profiles p
left join loans l on l.user_id = p.id
left join owned o on o.user_id = p.id
left join held h on h.user_id = p.id
left join open_disp d on d.user_id = p.id;

-- simple per-day rate limits: 20 item creations, 10 borrow requests
create table if not exists rate_limit_counters (
  user_id    uuid not null references profiles(id) on delete cascade,
  action     text not null check (action in ('CREATE_ITEM','REQUEST_HANDOFF')),
  day        date not null default current_date,
  count      integer not null default 0,
  primary key (user_id, action, day)
);
alter table rate_limit_counters enable row level security;
create policy rate_limit_self on rate_limit_counters
  for select to authenticated using (user_id = auth.uid());
-- writes happen only via SECURITY DEFINER helper below.

create or replace function check_and_bump_rate_limit(p_action text, p_limit integer)
returns boolean
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  current_count integer;
begin
  insert into rate_limit_counters (user_id, action, day, count)
  values (caller, p_action, current_date, 1)
  on conflict (user_id, action, day) do update set count = rate_limit_counters.count + 1
  returning count into current_count;

  return current_count <= p_limit;
end;
$$;
