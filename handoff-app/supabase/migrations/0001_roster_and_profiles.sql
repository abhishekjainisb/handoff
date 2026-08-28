-- ============================================================================
-- 0001_roster_and_profiles.sql
-- The roster is the entire anti-abuse strategy: nobody outside this table
-- can ever hold a profile. profiles.id = auth.users.id (1:1 with Supabase Auth).
-- ============================================================================

create extension if not exists pg_trgm;
create extension if not exists citext;
create extension if not exists pgcrypto;  -- gen_random_uuid(), crypt()/gen_salt() for handoff codes

create table if not exists roster (
  pgid          text primary key,
  name          text not null,
  email         citext not null unique,
  section       text not null check (section in ('A','B','C','D','E','F')),
  study_group   text not null,
  imported_at   timestamptz not null default now()
);

comment on table roster is
  'Closed cohort gate. Loaded once from Student_List__Class_of_2027.pdf via the seed script. Service-role write only.';

create table if not exists profiles (
  id                 uuid primary key references auth.users(id) on delete cascade,
  pgid               text not null unique references roster(pgid),
  name               text not null,
  email              citext not null unique,
  section            text not null,
  study_group        text not null,
  phone              text,                      -- optional, WhatsApp deep-links only, never login
  sv                 smallint check (sv between 1 and 3),
  block              char(1) check (block between 'A' and 'J'),
  quad               smallint check (quad between 1 and 24),
  address_display    text generated always as (
                        case when sv is not null and block is not null and quad is not null
                          then 'SV' || sv || ' ' || block || lpad(quad::text, 2, '0')
                          else null
                        end
                      ) stored,
  address_updated_at timestamptz,
  is_admin           boolean not null default false,
  onboarded_at       timestamptz,
  created_at         timestamptz not null default now()
);

comment on column profiles.address_display is 'Canonical "SV3 C01" format, derived — never write to this column directly.';

create index if not exists profiles_section_idx on profiles(section);
create index if not exists profiles_sv_block_idx on profiles(sv, block);
create index if not exists profiles_name_trgm_idx on profiles using gin (name gin_trgm_ops);

-- ----------------------------------------------------------------------------
-- New auth.users row -> auto-create the matching profile, but ONLY if the
-- email is in the roster. This is the actual gate (RLS can't stop signup,
-- only reads/writes afterward) — anyone can complete Supabase OAuth, but if
-- their email isn't in `roster` they get no profile and every other table's
-- RLS locks them out completely.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r roster%rowtype;
begin
  select * into r from roster where email = new.email;

  if r.pgid is null then
    -- Not a Co'27 student. Do not create a profile. The app's callback route
    -- checks for a missing profile and signs the user back out with a clear
    -- "this app is for ISB PGP Co'27 only" message.
    return new;
  end if;

  insert into profiles (id, pgid, name, email, section, study_group)
  values (new.id, r.pgid, r.name, r.email, r.section, r.study_group)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
