-- ============================================================================
-- 0002_items.sql
-- items = the catalog entry (owned by one person, has a value/policy/visibility).
-- item_units = the physical, individually-trackable copies of an item
-- (e.g. 6 folding chairs = 1 item row + 6 item_unit rows). Every handoff and
-- every custody event is keyed on a unit, never on the item, so quantity>1
-- items don't need a redesign later.
-- ============================================================================

create type borrow_policy as enum ('OPEN', 'OWNER_APPROVAL');
create type sublend_policy as enum ('FORBIDDEN', 'OWNER_APPROVAL', 'ALLOWED');
create type item_visibility as enum ('COHORT', 'MY_SECTION', 'MY_SV', 'MY_BLOCK');
create type item_condition as enum ('NEW', 'GOOD', 'WORN', 'BEAT_UP');
create type item_status as enum ('AVAILABLE', 'ON_LOAN', 'UNAVAILABLE', 'LOST', 'RETIRED');
create type item_category as enum (
  'AUDIO','FURNITURE','KITCHEN_COOKWARE','KITCHEN_CUTLERY_CROCKERY',
  'BOOKS_ACADEMIC','BOOKS_LEISURE','ELECTRONICS_CHARGERS','APPLIANCES',
  'SPORTS','LUGGAGE','FORMAL_WEAR','TOOLS_HARDWARE','PARTY_EVENT',
  'STATIONERY','OTHER'
);

create table if not exists items (
  id                   uuid primary key default gen_random_uuid(),
  owner_id             uuid not null references profiles(id) on delete cascade,
  title                text not null check (char_length(title) between 2 and 80),
  category             item_category not null default 'OTHER',
  description          text default '',
  photo_urls           text[] not null check (array_length(photo_urls, 1) between 1 and 4),
  estimated_value_inr  integer not null check (estimated_value_inr >= 0),
  condition            item_condition not null default 'GOOD',
  quantity             integer not null default 1 check (quantity between 1 and 200),
  borrow_policy        borrow_policy not null default 'OPEN',
  sublend_policy       sublend_policy not null default 'OWNER_APPROVAL',
  visibility           item_visibility not null default 'COHORT',
  max_loan_days        integer check (max_loan_days between 1 and 60),
  status               item_status not null default 'AVAILABLE',
  share_slug           text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  search_text          text generated always as (title || ' ' || coalesce(description, '')) stored,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

-- High-value items default to the stricter policy at the DB layer too, not
-- just in the create-item form — a client bug should not be able to make a
-- 25,000-rupee speaker OPEN/ALLOWED by skipping the UI guard.
create or replace function enforce_value_tier()
returns trigger language plpgsql as $$
begin
  if new.estimated_value_inr >= 5000 then
    if new.borrow_policy = 'OPEN' and tg_op = 'INSERT' then
      new.borrow_policy := 'OWNER_APPROVAL';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_value_tier on items;
create trigger items_value_tier
  before insert or update on items
  for each row execute function enforce_value_tier();

create index if not exists items_owner_idx on items(owner_id);
create index if not exists items_status_idx on items(status);
create index if not exists items_category_idx on items(category);
create index if not exists items_search_trgm_idx on items using gin (search_text gin_trgm_ops);

create table if not exists item_units (
  id           uuid primary key default gen_random_uuid(),
  item_id      uuid not null references items(id) on delete cascade,
  unit_number  integer not null,
  current_holder_id uuid references profiles(id),   -- denormalized cache, trigger-written only
  status       item_status not null default 'AVAILABLE',
  unique (item_id, unit_number)
);

create index if not exists item_units_item_idx on item_units(item_id);
create index if not exists item_units_holder_idx on item_units(current_holder_id);

-- Auto-create item_units rows matching `quantity` whenever an item is created,
-- and top up / trim if quantity changes later.
create or replace function sync_item_units()
returns trigger language plpgsql as $$
declare
  existing integer;
begin
  select count(*) into existing from item_units where item_id = new.id;

  if existing < new.quantity then
    insert into item_units (item_id, unit_number)
    select new.id, gs
    from generate_series(existing + 1, new.quantity) gs;
  elsif existing > new.quantity then
    delete from item_units
    where id in (
      select id from item_units
      where item_id = new.id and current_holder_id is null
      order by unit_number desc
      limit (existing - new.quantity)
    );
  end if;

  return new;
end;
$$;

drop trigger if exists items_sync_units on items;
create trigger items_sync_units
  after insert or update of quantity on items
  for each row execute function sync_item_units();
