-- ============================================================================
-- Release 1 / Migration 1 — Foundation schema + Row Level Security
--
-- Requirements traceability:
--   §3  roles Owner/Admin/User/Viewer enforced at the database layer (AUTH-004)
--   §16 tables: profiles, households, household_members, calendars,
--       categories, events (§16.1 canonical fields), user_preferences
--   §18 RLS on every exposed household table
--   §19 indexes on household_id + date ranges
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.household_role as enum ('owner', 'admin', 'user', 'viewer');
create type public.member_status  as enum ('active', 'disabled');
create type public.event_status   as enum ('confirmed', 'tentative', 'canceled');
create type public.event_visibility as enum ('household', 'private');

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — application profile mapped to auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text unique,
  display_name text,
  avatar_url   text,
  locale       text not null default 'en-US',
  timezone     text not null default 'America/Chicago',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row whenever a user signs up.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- households
-- ---------------------------------------------------------------------------
create table public.households (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  timezone      text not null default 'America/Chicago',
  week_start    smallint not null default 0 check (week_start between 0 and 6), -- 0 = Sunday
  default_view  text not null default 'dayGridMonth',
  default_event_duration_minutes integer not null default 60,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create trigger trg_households_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- household_members
-- ---------------------------------------------------------------------------
create table public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  role         public.household_role not null default 'user',
  status       public.member_status  not null default 'active',
  invited_by   uuid references public.profiles (id),
  joined_at    timestamptz not null default now(),
  primary key (household_id, user_id)
);

create index idx_household_members_user on public.household_members (user_id);

-- ---------------------------------------------------------------------------
-- calendars (local household calendars; provider-backed columns arrive in R3)
-- ---------------------------------------------------------------------------
create table public.calendars (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  color        text not null default '#3b5bdb',
  is_default   boolean not null default false,
  source       text not null default 'local',
  created_by   uuid references public.profiles (id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index idx_calendars_household on public.calendars (household_id);

create trigger trg_calendars_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- categories (§9 — admin managed; seeded from Appendix A at household creation)
-- ---------------------------------------------------------------------------
create table public.categories (
  id           uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  name         text not null,
  slug         text not null,
  color        text not null default '#64748b',
  foreground   text,                 -- optional readable-text override (CAL-003)
  icon         text,
  group_name   text,
  default_duration_minutes integer,
  sort_order   integer not null default 0,
  active       boolean not null default true,
  is_seed      boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (household_id, slug)
);

create index idx_categories_household on public.categories (household_id, active, sort_order);

create trigger trg_categories_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- events — canonical event record (§16.1). Local model is the source of truth.
-- ---------------------------------------------------------------------------
create table public.events (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  calendar_id        uuid not null references public.calendars (id),
  category_id        uuid references public.categories (id),
  organizer_user_id  uuid references public.profiles (id),
  title              text not null check (char_length(title) between 1 and 200),
  description        text,
  -- Timed events use start_at/end_at; all-day events use date semantics
  -- (start_date .. end_date_exclusive) per §10 "All day events".
  start_at           timestamptz,
  end_at             timestamptz,
  start_date         date,
  end_date_exclusive date,
  timezone           text not null,
  all_day            boolean not null default false,
  location_text      text,
  status             public.event_status not null default 'confirmed',
  visibility         public.event_visibility not null default 'household',
  recurrence_series_id uuid,          -- populated in R2 when recurrence lands
  created_by         uuid references public.profiles (id),
  updated_by         uuid references public.profiles (id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  deleted_at         timestamptz,
  -- EVT-001 at the database layer: end must follow start.
  constraint chk_timed_shape check (
    (all_day = false and start_at is not null and end_at is not null and end_at > start_at)
    or
    (all_day = true and start_date is not null and end_date_exclusive is not null
       and end_date_exclusive > start_date)
  )
);

-- §19: month/week queries must not full-scan at tens of thousands of events.
create index idx_events_household_start_at   on public.events (household_id, start_at)   where deleted_at is null;
create index idx_events_household_start_date on public.events (household_id, start_date) where deleted_at is null;
create index idx_events_household_deleted    on public.events (household_id, deleted_at);

create trigger trg_events_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- user_preferences
-- ---------------------------------------------------------------------------
create table public.user_preferences (
  user_id      uuid primary key references public.profiles (id) on delete cascade,
  default_view text,
  density      text not null default 'comfortable',
  time_format  text not null default '12h',
  filters      jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create trigger trg_user_preferences_updated_at
  before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ===========================================================================
-- Row Level Security helpers
--
-- SECURITY DEFINER so policy checks can read household_members without
-- recursive policy evaluation. Owned by the migration role, which bypasses
-- RLS on the tables it owns — the standard Supabase pattern.
-- ===========================================================================
create or replace function public.is_member(hid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members m
    where m.household_id = hid
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.member_role(hid uuid)
returns public.household_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role
  from public.household_members m
  where m.household_id = hid
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.shares_household_with(other uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members a
    join public.household_members b on a.household_id = b.household_id
    where a.user_id = auth.uid()
      and b.user_id = other
      and a.status = 'active'
      and b.status = 'active'
  );
$$;

-- ===========================================================================
-- Row Level Security policies (default deny; AUTH-004)
-- ===========================================================================
alter table public.profiles          enable row level security;
alter table public.households        enable row level security;
alter table public.household_members enable row level security;
alter table public.calendars         enable row level security;
alter table public.categories        enable row level security;
alter table public.events            enable row level security;
alter table public.user_preferences  enable row level security;

-- profiles: read yourself and people you share a household with; edit yourself.
create policy profiles_select on public.profiles
  for select using (id = auth.uid() or public.shares_household_with(id));
create policy profiles_update on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());

-- households: members read; Owner/Admin update; Owner deletes.
-- (No INSERT policy: households are created only via the create_household RPC.)
create policy households_select on public.households
  for select using (public.is_member(id));
create policy households_update on public.households
  for update using (public.member_role(id) in ('owner', 'admin'))
  with check (public.member_role(id) in ('owner', 'admin'));
create policy households_delete on public.households
  for delete using (public.member_role(id) = 'owner');

-- household_members: members read; Owner/Admin manage, but only the Owner may
-- create/modify/remove an 'owner' row (ownership transfer is Owner-only, §3).
create policy members_select on public.household_members
  for select using (public.is_member(household_id));
create policy members_insert on public.household_members
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin')
    and (role <> 'owner' or public.member_role(household_id) = 'owner')
  );
create policy members_update on public.household_members
  for update using (
    public.member_role(household_id) in ('owner', 'admin')
    and (role <> 'owner' or public.member_role(household_id) = 'owner')
  )
  with check (
    public.member_role(household_id) in ('owner', 'admin')
    and (role <> 'owner' or public.member_role(household_id) = 'owner')
  );
create policy members_delete on public.household_members
  for delete using (
    public.member_role(household_id) in ('owner', 'admin')
    and role <> 'owner'
  );

-- calendars: members read; Owner/Admin manage.
create policy calendars_select on public.calendars
  for select using (public.is_member(household_id));
create policy calendars_insert on public.calendars
  for insert with check (public.member_role(household_id) in ('owner', 'admin'));
create policy calendars_update on public.calendars
  for update using (public.member_role(household_id) in ('owner', 'admin'))
  with check (public.member_role(household_id) in ('owner', 'admin'));
create policy calendars_delete on public.calendars
  for delete using (public.member_role(household_id) in ('owner', 'admin'));

-- categories: members read; Owner/Admin manage (CAT-001 editor arrives in R2,
-- but the permission model is in place now).
create policy categories_select on public.categories
  for select using (public.is_member(household_id));
create policy categories_insert on public.categories
  for insert with check (public.member_role(household_id) in ('owner', 'admin'));
create policy categories_update on public.categories
  for update using (public.member_role(household_id) in ('owner', 'admin'))
  with check (public.member_role(household_id) in ('owner', 'admin'));
create policy categories_delete on public.categories
  for delete using (public.member_role(household_id) in ('owner', 'admin'));

-- events:
--   read    — active members; private events only for their creator/organizer
--   create  — Owner/Admin/User (Viewer is read-only, §3); creator stamped
--   update  — Owner/Admin any event; User their own events
--   delete  — Owner/Admin any event; User their own (app uses soft delete)
create policy events_select on public.events
  for select using (
    public.is_member(household_id)
    and (
      visibility = 'household'
      or created_by = auth.uid()
      or organizer_user_id = auth.uid()
    )
  );
create policy events_insert on public.events
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin', 'user')
    and created_by = auth.uid()
  );
create policy events_update on public.events
  for update using (
    public.member_role(household_id) in ('owner', 'admin')
    or (public.member_role(household_id) = 'user' and created_by = auth.uid())
  )
  with check (
    public.member_role(household_id) in ('owner', 'admin')
    or (public.member_role(household_id) = 'user' and created_by = auth.uid())
  );
create policy events_delete on public.events
  for delete using (
    public.member_role(household_id) in ('owner', 'admin')
    or (public.member_role(household_id) = 'user' and created_by = auth.uid())
  );

-- user_preferences: strictly personal.
create policy prefs_all on public.user_preferences
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
