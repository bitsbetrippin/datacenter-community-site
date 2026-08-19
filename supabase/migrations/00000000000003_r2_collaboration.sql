-- ============================================================================
-- Release 2 / Migration 3 — People, attendance, recurrence, reminders,
-- notifications, audit log.
--
-- Requirements traceability:
--   §8  people/contacts separate from accounts, attendee types, RSVP (PPL-001)
--   §10 recurrence (RRULE round-trippable), reminders with offsets (REM-001)
--   §15/§18 audit log — append-only for application roles (ADM-002, SEC-003)
--   §16 tables: people, event_attendees, event_recurrence, event_reminders,
--       notifications, audit_logs
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Event model additions
-- ---------------------------------------------------------------------------
-- Exception occurrences of a recurring series store which original occurrence
-- they replace (EVT-003: series edits must not clobber unrelated exceptions).
alter table public.events add column original_occurrence_at timestamptz;

-- Household toggle for birthday/anniversary display (PPL-003).
alter table public.households add column show_birthdays boolean not null default true;

-- ---------------------------------------------------------------------------
-- Helper: may the current user edit this event? (Owner/Admin any; User own.)
-- SECURITY DEFINER so dependent-table policies avoid recursive RLS lookups.
-- ---------------------------------------------------------------------------
create or replace function public.can_edit_event(eid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.events e
    where e.id = eid
      and (
        public.member_role(e.household_id) in ('owner', 'admin')
        or (public.member_role(e.household_id) = 'user' and e.created_by = auth.uid())
      )
  );
$$;

-- ---------------------------------------------------------------------------
-- people — shared household contacts/dependents; NOT application accounts (§8)
-- ---------------------------------------------------------------------------
create table public.people (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  display_name   text not null,
  email          text,
  birthday       date,
  anniversary    date,
  notes          text,
  member_user_id uuid references public.profiles (id),  -- set when contact is also a member
  created_by     uuid references public.profiles (id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index idx_people_household on public.people (household_id);
create trigger trg_people_updated_at
  before update on public.people
  for each row execute function public.set_updated_at();

alter table public.people enable row level security;
create policy people_select on public.people
  for select using (public.is_member(household_id));
create policy people_insert on public.people
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin', 'user')
  );
create policy people_update on public.people
  for update using (
    public.member_role(household_id) in ('owner', 'admin') or created_by = auth.uid()
  )
  with check (
    public.member_role(household_id) in ('owner', 'admin') or created_by = auth.uid()
  );
create policy people_delete on public.people
  for delete using (
    public.member_role(household_id) in ('owner', 'admin') or created_by = auth.uid()
  );

-- ---------------------------------------------------------------------------
-- event_attendees (§8) — members, contacts, or ad-hoc external emails
-- ---------------------------------------------------------------------------
create table public.event_attendees (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  event_id       uuid not null references public.events (id) on delete cascade,
  member_user_id uuid references public.profiles (id) on delete cascade,
  person_id      uuid references public.people (id) on delete cascade,
  display_name   text not null,
  email          text,
  attendee_type  text not null default 'required'
    check (attendee_type in ('required','optional','organizer','child','driver','observer')),
  rsvp           text not null default 'needs_response'
    check (rsvp in ('needs_response','accepted','declined','tentative')),
  comment        text,
  created_at     timestamptz not null default now()
);
create index idx_attendees_event on public.event_attendees (event_id);
create index idx_attendees_member on public.event_attendees (member_user_id);
create unique index uq_attendee_member on public.event_attendees (event_id, member_user_id)
  where member_user_id is not null;
create unique index uq_attendee_person on public.event_attendees (event_id, person_id)
  where person_id is not null;

alter table public.event_attendees enable row level security;
create policy attendees_select on public.event_attendees
  for select using (public.is_member(household_id));
create policy attendees_insert on public.event_attendees
  for insert with check (public.can_edit_event(event_id));
-- PPL-001: an attendee who is a member may update their own RSVP/comment;
-- event editors may update any attendee row.
create policy attendees_update on public.event_attendees
  for update using (public.can_edit_event(event_id) or member_user_id = auth.uid())
  with check (public.can_edit_event(event_id) or member_user_id = auth.uid());
create policy attendees_delete on public.event_attendees
  for delete using (public.can_edit_event(event_id));

-- ---------------------------------------------------------------------------
-- event_recurrence (§10, §16) — RRULE-compatible rule per series
-- The stored rrule text is the iCalendar representation (DTSTART + RRULE),
-- so it round-trips to .ics export/import directly.
-- ---------------------------------------------------------------------------
create table public.event_recurrence (
  series_id    uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households (id) on delete cascade,
  event_id     uuid not null unique references public.events (id) on delete cascade,
  rrule        text not null,
  exdates      timestamptz[] not null default '{}',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index idx_recurrence_household on public.event_recurrence (household_id);
create trigger trg_recurrence_updated_at
  before update on public.event_recurrence
  for each row execute function public.set_updated_at();

alter table public.event_recurrence enable row level security;
create policy recurrence_select on public.event_recurrence
  for select using (public.is_member(household_id));
create policy recurrence_insert on public.event_recurrence
  for insert with check (public.can_edit_event(event_id));
create policy recurrence_update on public.event_recurrence
  for update using (public.can_edit_event(event_id))
  with check (public.can_edit_event(event_id));
create policy recurrence_delete on public.event_recurrence
  for delete using (public.can_edit_event(event_id));

-- ---------------------------------------------------------------------------
-- event_reminders (§10) — offsets + delivery scope; in-app channel in R2
-- ---------------------------------------------------------------------------
create table public.event_reminders (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  event_id       uuid not null references public.events (id) on delete cascade,
  offset_minutes integer not null check (offset_minutes between 0 and 129600), -- up to 90 days
  channel        text not null default 'inapp' check (channel in ('inapp')),
  scope          text not null default 'creator' check (scope in ('creator','household')),
  created_by     uuid not null references public.profiles (id) on delete cascade,
  created_at     timestamptz not null default now()
);
create index idx_reminders_event on public.event_reminders (event_id);

alter table public.event_reminders enable row level security;
create policy reminders_select on public.event_reminders
  for select using (public.is_member(household_id));
-- Any non-viewer member may add their own reminder to an event they can see;
-- created_by is always the caller.
create policy reminders_insert on public.event_reminders
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin', 'user')
    and created_by = auth.uid()
  );
create policy reminders_delete on public.event_reminders
  for delete using (created_by = auth.uid() or public.can_edit_event(event_id));

-- ---------------------------------------------------------------------------
-- reminder_deliveries — REM-001: deterministic delivery key so retries never
-- duplicate a notification. Written only by the Worker cron (service role);
-- no client policies at all.
-- ---------------------------------------------------------------------------
create table public.reminder_deliveries (
  delivery_key     text primary key,   -- '<reminder_id>:<occurrence ISO>:<user_id>'
  reminder_id      uuid not null references public.event_reminders (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  occurrence_start timestamptz not null,
  delivered_at     timestamptz not null default now()
);
alter table public.reminder_deliveries enable row level security;

-- ---------------------------------------------------------------------------
-- notifications — in-app feed (§16); inserted by the Worker cron
-- ---------------------------------------------------------------------------
create table public.notifications (
  id               uuid primary key default gen_random_uuid(),
  household_id     uuid not null references public.households (id) on delete cascade,
  user_id          uuid not null references public.profiles (id) on delete cascade,
  kind             text not null default 'reminder',
  title            text not null,
  body             text,
  event_id         uuid references public.events (id) on delete set null,
  occurrence_start timestamptz,
  read_at          timestamptz,
  created_at       timestamptz not null default now()
);
create index idx_notifications_user on public.notifications (user_id, read_at, created_at desc);

alter table public.notifications enable row level security;
create policy notifications_select on public.notifications
  for select using (user_id = auth.uid());
create policy notifications_update on public.notifications
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications
  for delete using (user_id = auth.uid());
-- (no client INSERT policy — the service-role cron writes these)

-- ---------------------------------------------------------------------------
-- audit_logs (§15/§18) — append-only for application roles (SEC-003).
-- Rows are written by SECURITY DEFINER triggers; clients can only read
-- (Owner/Admin), never insert/update/delete through the API.
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id           bigint generated always as identity primary key,
  household_id uuid,
  actor        uuid,
  action       text not null,       -- INSERT / UPDATE / DELETE
  object_type  text not null,       -- table name
  object_id    text,
  summary      jsonb,
  created_at   timestamptz not null default now()
);
create index idx_audit_household on public.audit_logs (household_id, created_at desc);

alter table public.audit_logs enable row level security;
create policy audit_select on public.audit_logs
  for select using (public.member_role(household_id) in ('owner', 'admin'));

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_household uuid;
  v_id text;
  v_before jsonb;
  v_after jsonb;
begin
  if tg_op = 'DELETE' then
    v_before := to_jsonb(old) - 'description';
    v_household := (to_jsonb(old) ->> 'household_id')::uuid;
    v_id := coalesce(to_jsonb(old) ->> 'id',
                     (to_jsonb(old) ->> 'household_id') || ':' || (to_jsonb(old) ->> 'user_id'));
  else
    v_after := to_jsonb(new) - 'description';
    v_household := (to_jsonb(new) ->> 'household_id')::uuid;
    v_id := coalesce(to_jsonb(new) ->> 'id',
                     (to_jsonb(new) ->> 'household_id') || ':' || (to_jsonb(new) ->> 'user_id'));
    if tg_op = 'UPDATE' then
      v_before := to_jsonb(old) - 'description';
    end if;
  end if;

  -- households table: the row IS the household
  if tg_table_name = 'households' then
    v_household := coalesce((to_jsonb(coalesce(to_jsonb(new), to_jsonb(old))) ->> 'id')::uuid, v_household);
  end if;

  insert into public.audit_logs (household_id, actor, action, object_type, object_id, summary)
  values (
    v_household,
    auth.uid(),
    tg_op,
    tg_table_name,
    v_id,
    jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', v_after))
  );
  return coalesce(new, old);
end;
$$;

-- ADM-002 traceability: role changes, category changes, calendar changes,
-- household changes, and destructive event actions.
create trigger trg_audit_members
  after insert or update or delete on public.household_members
  for each row execute function public.write_audit();
create trigger trg_audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.write_audit();
create trigger trg_audit_calendars
  after insert or update or delete on public.calendars
  for each row execute function public.write_audit();
create trigger trg_audit_households
  after update or delete on public.households
  for each row execute function public.write_audit();
-- events: only deletion and soft-delete/restore transitions (avoid noise)
create trigger trg_audit_events_softdelete
  after update on public.events
  for each row
  when (old.deleted_at is distinct from new.deleted_at)
  execute function public.write_audit();
create trigger trg_audit_events_delete
  after delete on public.events
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Realtime (optional per §4): live refresh of calendar + notification bell.
-- Guarded so environments without the supabase_realtime publication still
-- apply cleanly.
-- ---------------------------------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.events;
exception
  when undefined_object then null;
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.notifications;
exception
  when undefined_object then null;
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;
