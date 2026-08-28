-- ============================================================================
-- 0003_wanted_and_disputes.sql
-- ============================================================================

create type wanted_status as enum ('OPEN', 'FULFILLED', 'EXPIRED', 'CANCELLED');

create table if not exists wanted_posts (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references profiles(id) on delete cascade,
  title         text not null check (char_length(title) between 2 and 80),
  category      item_category not null default 'OTHER',
  note          text default '',
  needed_from   date not null,
  needed_until  date not null check (needed_until >= needed_from),
  status        wanted_status not null default 'OPEN',
  fulfilled_by_item_id uuid references items(id),
  share_slug    text not null unique default substr(md5(gen_random_uuid()::text), 1, 8),
  created_at    timestamptz not null default now()
);

create index if not exists wanted_requester_idx on wanted_posts(requester_id);
create index if not exists wanted_status_idx on wanted_posts(status);

create type dispute_type as enum ('LOST', 'DAMAGED', 'NOT_RECEIVED', 'NOT_RETURNED');
create type dispute_status as enum ('OPEN', 'RESOLVED', 'ESCALATED');

create table if not exists disputes (
  id                uuid primary key default gen_random_uuid(),
  item_unit_id      uuid not null references item_units(id) on delete cascade,
  handoff_id        uuid,   -- fk added in 0004 after handoffs exists
  raised_by         uuid not null references profiles(id),
  against            uuid references profiles(id),
  type              dispute_type not null,
  reference_value_inr integer,
  note              text default '',
  status            dispute_status not null default 'OPEN',
  settlement_ref    text,   -- hook for a future Hisaab money-settlement link; unused by v1 UI
  created_at        timestamptz not null default now(),
  resolved_at       timestamptz
);

create index if not exists disputes_unit_idx on disputes(item_unit_id);
create index if not exists disputes_status_idx on disputes(status);
