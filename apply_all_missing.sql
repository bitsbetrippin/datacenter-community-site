-- ============================================================================
-- COMBINED ONE-PASTE FIX (Releases 2 + 3 + 4 + v1.0)
-- Run the WHOLE file in Supabase -> SQL Editor. Safe to run multiple times.
-- Applies only what's missing, then records history so CI has nothing to redo.
-- Final row must show all five values true.
-- ============================================================================


do $outer3$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='people') then
    raise notice 'migration 3 (r2_collaboration): already applied - skipping';
  else
    execute $mig3$
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

$mig3$;
    raise notice 'migration 3 (r2_collaboration): APPLIED';
  end if;
end $outer3$;


do $outer4$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='event_attachments') then
    raise notice 'migration 4 (r2_attachments): already applied - skipping';
  else
    execute $mig4$
-- ============================================================================
-- Release 2 / Migration 4 — Attachments (§11, WP5)
--
--   * event_attachments metadata table with RLS (FILE-001)
--   * private 'attachments' storage bucket with size + MIME allow-list
--   * storage.objects policies: membership required for every object request
--     (SEC-002 — knowing a path grants nothing)
--
-- Object path convention: <household_id>/<event_id>/<uuid>-<filename>
-- ============================================================================

create table public.event_attachments (
  id                uuid primary key default gen_random_uuid(),
  household_id      uuid not null references public.households (id) on delete cascade,
  event_id          uuid not null references public.events (id) on delete cascade,
  uploader_id       uuid references public.profiles (id),
  original_filename text not null,
  storage_path      text not null unique,
  mime_type         text not null,
  byte_size         bigint not null check (byte_size >= 0),
  checksum          text,
  caption           text,
  created_at        timestamptz not null default now()
);
create index idx_attachments_event on public.event_attachments (event_id);

alter table public.event_attachments enable row level security;
create policy attachments_meta_select on public.event_attachments
  for select using (public.is_member(household_id));
create policy attachments_meta_insert on public.event_attachments
  for insert with check (
    public.member_role(household_id) in ('owner', 'admin', 'user')
    and uploader_id = auth.uid()
  );
create policy attachments_meta_delete on public.event_attachments
  for delete using (
    uploader_id = auth.uid() or public.can_edit_event(event_id)
  );

-- ---------------------------------------------------------------------------
-- Storage bucket + object policies (guarded: no-ops where the storage schema
-- is absent, e.g. local test databases).
-- ---------------------------------------------------------------------------
do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values (
    'attachments', 'attachments', false,
    26214400,  -- 25 MB per file
    array[
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-powerpoint',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'text/plain',
      'text/csv',
      'text/calendar',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
  )
  on conflict (id) do nothing;
exception
  when undefined_table then null;
  when invalid_schema_name then null;
  when insufficient_privilege then null;
end $$;

do $$
begin
  -- Read: any active household member (the first path folder is household_id).
  create policy attachments_object_read on storage.objects
    for select using (
      bucket_id = 'attachments'
      and public.is_member(((storage.foldername(name))[1])::uuid)
    );
  -- Upload: Owner/Admin/User members only, into their own household's folder.
  create policy attachments_object_insert on storage.objects
    for insert with check (
      bucket_id = 'attachments'
      and public.member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin', 'user')
    );
  -- Delete: Owner/Admin, or the original uploader.
  create policy attachments_object_delete on storage.objects
    for delete using (
      bucket_id = 'attachments'
      and (
        public.member_role(((storage.foldername(name))[1])::uuid) in ('owner', 'admin')
        or owner = auth.uid()
      )
    );
exception
  when undefined_table then null;
  when undefined_function then null;
  when invalid_schema_name then null;
  when duplicate_object then null;
  when insufficient_privilege then null;
end $$;

$mig4$;
    raise notice 'migration 4 (r2_attachments): APPLIED';
  end if;
end $outer4$;


do $outer5$
begin
  if exists (select 1 from information_schema.tables where table_schema='public' and table_name='service_providers') then
    raise notice 'migration 5 (r3_integrations): already applied - skipping';
  else
    execute $mig5$
-- ============================================================================
-- Release 3 / Migration 5 — Integration hub: service registry, connections,
-- sync engine state, provider mappings, conflicts.
--
-- Requirements traceability:
--   §13  service registry (providers/endpoints/mappings, Appendix B seeds)
--   §14  sync state, jobs, conflicts, tombstones
--   §16  service_* tables, sync_state, sync_jobs, webhook_subscriptions,
--        conflicts, event_provider_mappings
--   §18  provider tokens server-side only (INT-003): token columns live in
--        connection_secrets, a table with RLS enabled and ZERO client
--        policies — only the Worker's service role can touch it.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- calendars: provider-backed calendar columns (source existed since R1)
-- ---------------------------------------------------------------------------
alter table public.calendars
  add column connection_id uuid,
  add column remote_id text,
  add column sync_direction text not null default 'twoway'
    check (sync_direction in ('twoway', 'pull', 'push'));

-- ---------------------------------------------------------------------------
-- service_providers — registry master records (system-seeded, Appendix B)
-- ---------------------------------------------------------------------------
create table public.service_providers (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique,
  display_name    text not null,
  description     text,
  provider_family text,
  version         text not null default '1',
  active          boolean not null default true,
  environment     text not null default 'production',
  auth            jsonb not null default '{}'::jsonb,  -- auth_type, urls, scopes, pkce
  api             jsonb not null default '{}'::jsonb,  -- base_url, headers, timeouts
  formats         text[] not null default '{}',
  capabilities    jsonb not null default '{}'::jsonb,  -- capability flags (§13.2)
  sync            jsonb not null default '{}'::jsonb,  -- strategy, poll seconds, horizon
  rate            jsonb not null default '{}'::jsonb,  -- retries, backoff
  webhook         jsonb not null default '{}'::jsonb,
  is_system       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create trigger trg_providers_updated_at
  before update on public.service_providers
  for each row execute function public.set_updated_at();

alter table public.service_providers enable row level security;
-- Registry profiles are readable by any signed-in member (INT-005 health UI);
-- they are written only by migrations/service role (ADM-003 safety: a client
-- cannot break provider config through the API).
create policy providers_select on public.service_providers
  for select using (auth.uid() is not null);

create table public.service_provider_endpoints (
  id            uuid primary key default gen_random_uuid(),
  provider_id   uuid not null references public.service_providers (id) on delete cascade,
  operation_key text not null,
  method        text not null,
  path_template text not null,
  pagination    jsonb not null default '{}'::jsonb,
  notes         text,
  unique (provider_id, operation_key)
);
alter table public.service_provider_endpoints enable row level security;
create policy provider_endpoints_select on public.service_provider_endpoints
  for select using (auth.uid() is not null);

create table public.service_provider_mappings (
  id              uuid primary key default gen_random_uuid(),
  provider_id     uuid not null references public.service_providers (id) on delete cascade,
  canonical_field text not null,
  provider_path   text not null,
  direction       text not null default 'both' check (direction in ('both', 'pull', 'push')),
  transform       text,
  notes           text
);
alter table public.service_provider_mappings enable row level security;
create policy provider_mappings_select on public.service_provider_mappings
  for select using (auth.uid() is not null);

-- ---------------------------------------------------------------------------
-- service_connections — a household's connected account (INT-001: many per
-- household). Token material is NOT here — see connection_secrets.
-- ---------------------------------------------------------------------------
create table public.service_connections (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  provider_id     uuid not null references public.service_providers (id),
  provider_code   text not null,
  account_email   text,
  account_label   text,
  status          text not null default 'connected'
    check (status in ('connected', 'attention', 'paused', 'failed', 'disconnected')),
  status_detail   text,
  scopes          text[] not null default '{}',
  last_success_at timestamptz,
  last_error      text,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index idx_connections_household on public.service_connections (household_id);
create trigger trg_connections_updated_at
  before update on public.service_connections
  for each row execute function public.set_updated_at();

alter table public.service_connections enable row level security;
create policy connections_select on public.service_connections
  for select using (public.is_member(household_id));
-- Owner/Admin may pause/resume (status flips); creation/token work happens in
-- the Worker via service role. Deletion goes through the disconnect endpoint
-- so remote revocation + retention run (INT-004).
create policy connections_update on public.service_connections
  for update using (public.member_role(household_id) in ('owner', 'admin'))
  with check (public.member_role(household_id) in ('owner', 'admin'));

-- Tokens, encrypted (AES-GCM; key derived in the Worker, never stored).
-- NO client policies: browser code can never read this table (INT-003).
create table public.connection_secrets (
  connection_id     uuid primary key references public.service_connections (id) on delete cascade,
  access_token_enc  text,
  refresh_token_enc text,
  token_type        text,
  expires_at        timestamptz,
  updated_at        timestamptz not null default now()
);
alter table public.connection_secrets enable row level security;

-- Short-lived OAuth state (CSRF + PKCE). Worker only.
create table public.oauth_states (
  state         text primary key,
  household_id  uuid not null,
  user_id       uuid not null,
  provider_code text not null,
  pkce_verifier text not null,
  redirect_to   text,
  used          boolean not null default false,
  created_at    timestamptz not null default now()
);
alter table public.oauth_states enable row level security;

-- ---------------------------------------------------------------------------
-- sync_state — cursor/checkpoint per connection + remote calendar (SYNC-002)
-- ---------------------------------------------------------------------------
create table public.sync_state (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  connection_id      uuid not null references public.service_connections (id) on delete cascade,
  remote_calendar_id text not null,
  calendar_id        uuid references public.calendars (id) on delete cascade,
  cursor             text,
  full_synced_at     timestamptz,
  last_attempt_at    timestamptz,
  last_success_at    timestamptz,
  last_error         text,
  last_outbound_at   timestamptz,
  unique (connection_id, remote_calendar_id)
);
alter table public.sync_state enable row level security;
create policy sync_state_select on public.sync_state
  for select using (public.member_role(household_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- sync_jobs — queued/running/completed/failed with attempts (SYNC-001/002)
-- ---------------------------------------------------------------------------
create table public.sync_jobs (
  id             uuid primary key default gen_random_uuid(),
  household_id   uuid not null references public.households (id) on delete cascade,
  connection_id  uuid references public.service_connections (id) on delete cascade,
  kind           text not null check (kind in ('pull', 'push', 'renew_subscriptions', 'test')),
  status         text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  attempts       integer not null default 0,
  run_after      timestamptz not null default now(),
  payload        jsonb not null default '{}'::jsonb,
  error          text,
  correlation_id uuid not null default gen_random_uuid(),  -- §19 diagnostics
  created_at     timestamptz not null default now(),
  finished_at    timestamptz
);
create index idx_sync_jobs_due on public.sync_jobs (status, run_after);
alter table public.sync_jobs enable row level security;
create policy sync_jobs_select on public.sync_jobs
  for select using (public.member_role(household_id) in ('owner', 'admin'));

-- ---------------------------------------------------------------------------
-- webhook_subscriptions — provider change-notification lifecycle (SYNC-004)
-- Contains the per-subscription validation secret → Worker only, no policies.
-- ---------------------------------------------------------------------------
create table public.webhook_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  connection_id   uuid not null references public.service_connections (id) on delete cascade,
  provider_code   text not null,
  subscription_id text not null,
  resource        text not null,
  client_state    text not null,
  expires_at      timestamptz,
  status          text not null default 'active'
    check (status in ('active', 'expired', 'error')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create unique index uq_webhook_sub on public.webhook_subscriptions (provider_code, subscription_id);
create trigger trg_webhook_subs_updated_at
  before update on public.webhook_subscriptions
  for each row execute function public.set_updated_at();
alter table public.webhook_subscriptions enable row level security;

-- ---------------------------------------------------------------------------
-- event_provider_mappings — remote identity kept OFF the canonical event
-- (INT-002); snapshot hash powers echo prevention (SYNC-003).
-- ---------------------------------------------------------------------------
create table public.event_provider_mappings (
  id                 uuid primary key default gen_random_uuid(),
  household_id       uuid not null references public.households (id) on delete cascade,
  event_id           uuid not null references public.events (id) on delete cascade,
  connection_id      uuid not null references public.service_connections (id) on delete cascade,
  remote_calendar_id text not null,
  remote_event_id    text not null,
  etag               text,
  change_key         text,
  last_synced_hash   text,
  last_synced_at     timestamptz,
  remote_updated_at  timestamptz,
  deleted_remote     boolean not null default false,
  unique (connection_id, remote_event_id)
);
create index idx_epm_event on public.event_provider_mappings (event_id);
alter table public.event_provider_mappings enable row level security;
-- Members can see mapping metadata (event detail shows source + last sync,
-- EVT-005); only the Worker writes it.
create policy epm_select on public.event_provider_mappings
  for select using (public.is_member(household_id));

-- ---------------------------------------------------------------------------
-- conflicts — both sides changed; never silently discarded (§14.2)
-- ---------------------------------------------------------------------------
create table public.conflicts (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references public.households (id) on delete cascade,
  event_id        uuid not null references public.events (id) on delete cascade,
  connection_id   uuid references public.service_connections (id) on delete set null,
  local_snapshot  jsonb not null,
  remote_snapshot jsonb not null,
  state           text not null default 'open' check (state in ('open', 'resolved')),
  resolution      text check (resolution in ('local', 'remote')),
  resolved_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz
);
create index idx_conflicts_open on public.conflicts (household_id, state);
alter table public.conflicts enable row level security;
create policy conflicts_select on public.conflicts
  for select using (public.is_member(household_id));
-- §14.2: Owner/Admin/User may resolve.
create policy conflicts_update on public.conflicts
  for update using (public.member_role(household_id) in ('owner', 'admin', 'user'))
  with check (public.member_role(household_id) in ('owner', 'admin', 'user'));

-- ---------------------------------------------------------------------------
-- Audit: provider connect/disconnect and registry-affecting changes (ADM-002)
-- ---------------------------------------------------------------------------
create trigger trg_audit_connections
  after insert or update or delete on public.service_connections
  for each row execute function public.write_audit();

-- ---------------------------------------------------------------------------
-- Appendix B seed profiles
-- ---------------------------------------------------------------------------
insert into public.service_providers
  (code, display_name, description, provider_family, formats, auth, api, capabilities, sync, rate, webhook, active)
values
(
  'GOOGLE_CALENDAR', 'Google Calendar',
  'Read/write with incremental sync via sync tokens.',
  'google', array['json'],
  jsonb_build_object(
    'auth_type', 'oauth2',
    'authorization_url', 'https://accounts.google.com/o/oauth2/v2/auth',
    'token_url', 'https://oauth2.googleapis.com/token',
    'revocation_url', 'https://oauth2.googleapis.com/revoke',
    'scopes', array['https://www.googleapis.com/auth/calendar', 'openid', 'email'],
    'pkce', true
  ),
  jsonb_build_object('base_url', 'https://www.googleapis.com/calendar/v3', 'timeout_ms', 15000),
  jsonb_build_object(
    'list_calendars', true, 'read_events', true, 'create', true, 'update', true,
    'delete', true, 'recurrence', true, 'attendees', true, 'reminders', false,
    'attachments', false, 'colors', true, 'webhooks', false, 'incremental', true
  ),
  jsonb_build_object('strategy', 'sync_token', 'poll_seconds', 300, 'full_sync_horizon_days', 365),
  jsonb_build_object('max_retries', 5, 'backoff_base_ms', 2000, 'respect_retry_after', true),
  jsonb_build_object('mode', 'none', 'note', 'Google watch channels require a verified custom domain; polling covers R3 on workers.dev.'),
  true
),
(
  'MS_GRAPH_CALENDAR', 'Microsoft 365 / Outlook',
  'Read/write with delta sync and change notifications.',
  'microsoft', array['json'],
  jsonb_build_object(
    'auth_type', 'oauth2',
    'authorization_url', 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    'token_url', 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    'scopes', array['offline_access', 'User.Read', 'Calendars.ReadWrite'],
    'pkce', true
  ),
  jsonb_build_object('base_url', 'https://graph.microsoft.com/v1.0', 'timeout_ms', 15000),
  jsonb_build_object(
    'list_calendars', true, 'read_events', true, 'create', true, 'update', true,
    'delete', true, 'recurrence', true, 'attendees', true, 'reminders', false,
    'attachments', false, 'colors', false, 'webhooks', true, 'incremental', true
  ),
  jsonb_build_object('strategy', 'delta', 'poll_seconds', 300, 'full_sync_horizon_days', 365),
  jsonb_build_object('max_retries', 5, 'backoff_base_ms', 2000, 'respect_retry_after', true),
  jsonb_build_object('mode', 'change_notifications', 'lifecycle_days', 3, 'renew_before_hours', 24),
  true
),
('CALDAV_GENERIC', 'Generic CalDAV', 'Calendar discovery and event read/write per server capability.', 'caldav',
 array['xml','icalendar'],
 jsonb_build_object('auth_type', 'basic_or_app_password'),
 jsonb_build_object('base_url', null),
 jsonb_build_object('read_events', true, 'create', true, 'update', true, 'delete', true, 'recurrence', true),
 jsonb_build_object('strategy', 'ctag_poll', 'poll_seconds', 900), '{}', '{}', false),
('ICS_FILE', 'iCalendar file', 'Manual import/export (shipped in Release 2).', 'ics',
 array['icalendar'], jsonb_build_object('auth_type', 'none'), '{}',
 jsonb_build_object('import', true, 'export', true), '{}', '{}', '{}', true),
('ICS_FEED', 'iCalendar subscription feed', 'Scheduled read-only refresh with ETag/Last-Modified.', 'ics',
 array['icalendar'], jsonb_build_object('auth_type', 'none_or_basic'), '{}',
 jsonb_build_object('read_events', true), jsonb_build_object('strategy', 'etag_poll', 'poll_seconds', 3600),
 '{}', '{}', false),
('JCAL_GENERIC', 'jCal interchange', 'Standards-based JSON representation of iCalendar (future).', 'standards',
 array['json'], '{}', '{}', '{}', '{}', '{}', '{}', false),
('XCAL_GENERIC', 'xCal interchange', 'Standards-based XML representation of iCalendar (future).', 'standards',
 array['xml'], '{}', '{}', '{}', '{}', '{}', '{}', false),
('REST_JSON_GENERIC', 'Generic REST JSON', 'Registry-defined adapter profile (future).', 'generic',
 array['json'], '{}', '{}', '{}', '{}', '{}', '{}', false),
('REST_XML_GENERIC', 'Generic REST XML', 'Registry-defined adapter profile (future).', 'generic',
 array['xml'], '{}', '{}', '{}', '{}', '{}', '{}', false),
('GMAIL_FUTURE', 'Gmail extension', 'Reserved: invitation email → event workflows (not calendar sync).', 'google',
 array['json'], '{}', '{}', '{}', '{}', '{}', '{}', false);

-- Endpoint catalogs for the two live adapters (registry-visible, §13.2)
insert into public.service_provider_endpoints (provider_id, operation_key, method, path_template, pagination, notes)
select p.id, e.op, e.method, e.path, e.pagination::jsonb, e.notes
from public.service_providers p
join (values
  ('GOOGLE_CALENDAR', 'list_calendars', 'GET',    '/users/me/calendarList',                    '{"type":"pageToken"}', null),
  ('GOOGLE_CALENDAR', 'list_events',    'GET',    '/calendars/{calendarId}/events',            '{"type":"pageToken","sync":"syncToken"}', 'singleEvents=false; masters + exceptions'),
  ('GOOGLE_CALENDAR', 'create_event',   'POST',   '/calendars/{calendarId}/events',            '{}', null),
  ('GOOGLE_CALENDAR', 'update_event',   'PATCH',  '/calendars/{calendarId}/events/{eventId}',  '{}', 'If-Match etag'),
  ('GOOGLE_CALENDAR', 'delete_event',   'DELETE', '/calendars/{calendarId}/events/{eventId}',  '{}', null),
  ('MS_GRAPH_CALENDAR', 'list_calendars', 'GET',    '/me/calendars',                            '{"type":"nextLink"}', null),
  ('MS_GRAPH_CALENDAR', 'delta_events',   'GET',    '/me/calendars/{calendarId}/events/delta',  '{"type":"deltaLink"}', null),
  ('MS_GRAPH_CALENDAR', 'create_event',   'POST',   '/me/calendars/{calendarId}/events',        '{}', null),
  ('MS_GRAPH_CALENDAR', 'update_event',   'PATCH',  '/me/events/{eventId}',                     '{}', 'If-Match @odata.etag'),
  ('MS_GRAPH_CALENDAR', 'delete_event',   'DELETE', '/me/events/{eventId}',                     '{}', null),
  ('MS_GRAPH_CALENDAR', 'create_subscription', 'POST',  '/subscriptions',                       '{}', 'change notifications'),
  ('MS_GRAPH_CALENDAR', 'renew_subscription',  'PATCH', '/subscriptions/{subscriptionId}',      '{}', null)
) as e(code, op, method, path, pagination, notes) on e.code = p.code;

-- Canonical field mappings (registry-visible; adapters implement them)
insert into public.service_provider_mappings (provider_id, canonical_field, provider_path, direction, transform)
select p.id, m.canonical, m.path, m.dir, m.transform
from public.service_providers p
join (values
  ('GOOGLE_CALENDAR', 'title',       'summary',                'both', null),
  ('GOOGLE_CALENDAR', 'description', 'description',            'both', null),
  ('GOOGLE_CALENDAR', 'location',    'location',               'both', null),
  ('GOOGLE_CALENDAR', 'start',       'start.dateTime|start.date', 'both', 'all_day → date'),
  ('GOOGLE_CALENDAR', 'end',         'end.dateTime|end.date',  'both', 'exclusive date semantics match'),
  ('GOOGLE_CALENDAR', 'timezone',    'start.timeZone',         'both', null),
  ('GOOGLE_CALENDAR', 'status',      'status',                 'both', 'cancelled→canceled'),
  ('GOOGLE_CALENDAR', 'recurrence',  'recurrence[]',           'both', 'RRULE lines'),
  ('GOOGLE_CALENDAR', 'attendees',   'attendees[]',            'both', 'email/displayName/responseStatus'),
  ('MS_GRAPH_CALENDAR', 'title',       'subject',              'both', null),
  ('MS_GRAPH_CALENDAR', 'description', 'body.content',         'both', 'text content type'),
  ('MS_GRAPH_CALENDAR', 'location',    'location.displayName', 'both', null),
  ('MS_GRAPH_CALENDAR', 'start',       'start.dateTime+start.timeZone', 'both', null),
  ('MS_GRAPH_CALENDAR', 'end',         'end.dateTime+end.timeZone',     'both', null),
  ('MS_GRAPH_CALENDAR', 'all_day',     'isAllDay',             'both', null),
  ('MS_GRAPH_CALENDAR', 'status',      'showAs+isCancelled',   'both', 'tentative→tentative'),
  ('MS_GRAPH_CALENDAR', 'recurrence',  'recurrence',           'both', 'patternedRecurrence↔RRULE (common patterns)'),
  ('MS_GRAPH_CALENDAR', 'attendees',   'attendees[]',          'both', 'emailAddress/status.response')
) as m(code, canonical, path, dir, transform) on m.code = p.code;

$mig5$;
    raise notice 'migration 5 (r3_integrations): APPLIED';
  end if;
end $outer5$;


do $outer6$
begin
  if exists (select 1 from information_schema.columns where table_name='service_connections' and column_name='config') then
    raise notice 'migration 6 (r4_standards_hardening): already applied - skipping';
  else
    execute $mig6$
-- ============================================================================
-- Release 4 / Migration 6 — Standards adapters + hardening groundwork
--
--   * service_connections.config — non-secret connection settings
--     (ICS feed URL, CalDAV base URL/username). Secrets stay in
--     connection_secrets (Worker-only) as always.
--   * households.default_category_id — CAT-003 household default category.
--   * user_preferences.theme — theme layer groundwork (seasonal themes later
--     become content additions, not code changes).
--   * Activate the ICS_FEED and CALDAV_GENERIC registry profiles (WP9).
-- ============================================================================

alter table public.service_connections
  add column config jsonb not null default '{}'::jsonb;

alter table public.households
  add column default_category_id uuid references public.categories (id);

alter table public.user_preferences
  add column theme text not null default 'classic';

update public.service_providers
set active = true,
    sync = sync || jsonb_build_object('poll_seconds',
      case code when 'ICS_FEED' then 1800 else 900 end)
where code in ('ICS_FEED', 'CALDAV_GENERIC');

$mig6$;
    raise notice 'migration 6 (r4_standards_hardening): APPLIED';
  end if;
end $outer6$;


do $outer7$
begin
  if exists (select 1 from information_schema.columns where table_name='events' and column_name='needs_attention') then
    raise notice 'migration 7 (v1_import_and_roles): already applied - skipping';
  else
    execute $mig7$
-- ============================================================================
-- v1.0 / Migration 7 — Import review flags + role-gated signups
--
--   * events.needs_attention — set by the Import center when an event arrives
--     without a time and/or category (e.g. parsed from a calendar screenshot).
--     Rendered with a red outline until reviewed; cleared when an editor saves
--     the event with a category assigned.
--   * list_unassigned_profiles() — lets a household Owner/Admin see people who
--     signed up but have no role yet ("waiting room" flow).
--   * add_member_by_id() — assign a role to a pending signup in one click.
-- ============================================================================

alter table public.events
  add column needs_attention boolean not null default false;

-- Partial index: the attention list stays cheap to query.
create index idx_events_attention on public.events (household_id)
  where needs_attention and deleted_at is null;

-- ---------------------------------------------------------------------------
-- Pending signups: profiles that belong to NO household yet.
-- SECURITY DEFINER; callable only by someone who is Owner/Admin of at least
-- one household (fine for a private family deployment where every signup is
-- expected to be family).
-- ---------------------------------------------------------------------------
create or replace function public.list_unassigned_profiles()
returns table (id uuid, email text, display_name text, created_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.household_members m
    where m.user_id = auth.uid()
      and m.status = 'active'
      and m.role in ('owner', 'admin')
  ) then
    raise exception 'not_authorized';
  end if;

  return query
  select p.id, p.email, p.display_name, p.created_at
  from public.profiles p
  where not exists (
    select 1 from public.household_members m
    where m.user_id = p.id and m.status = 'active'
  )
  order by p.created_at desc;
end;
$$;

revoke all on function public.list_unassigned_profiles() from public;
grant execute on function public.list_unassigned_profiles() to authenticated;

-- ---------------------------------------------------------------------------
-- Assign a role to a pending signup.
-- ---------------------------------------------------------------------------
create or replace function public.add_member_by_id(
  p_household uuid,
  p_user      uuid,
  p_role      public.household_role default 'user'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.member_role(p_household) not in ('owner', 'admin') then
    raise exception 'not_authorized';
  end if;
  if p_role = 'owner' then
    raise exception 'cannot_grant_owner';
  end if;

  insert into public.household_members (household_id, user_id, role, status, invited_by)
  values (p_household, p_user, p_role, 'active', auth.uid())
  on conflict (household_id, user_id)
  do update set role = excluded.role, status = 'active';
end;
$$;

revoke all on function public.add_member_by_id(uuid, uuid, public.household_role) from public;
grant execute on function public.add_member_by_id(uuid, uuid, public.household_role) to authenticated;

$mig7$;
    raise notice 'migration 7 (v1_import_and_roles): APPLIED';
  end if;
end $outer7$;


create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key, statements text[], name text);
do $hist$
declare m record;
begin
  for m in select * from (values
      ('00000000000001','foundation'),
      ('00000000000002','seeds_and_rpcs'),
      ('00000000000003','r2_collaboration'),
      ('00000000000004','r2_attachments'),
      ('00000000000005','r3_integrations'),
      ('00000000000006','r4_standards_hardening'),
      ('00000000000007','v1_import_and_roles')
    ) as t(version, name)
  loop
    begin
      insert into supabase_migrations.schema_migrations (version, name)
      values (m.version, m.name) on conflict (version) do nothing;
    exception when undefined_column then
      insert into supabase_migrations.schema_migrations (version)
      values (m.version) on conflict (version) do nothing;
    end;
  end loop;
end $hist$;

select
  exists (select 1 from information_schema.tables  where table_name='people')            as r2_people_ok,
  exists (select 1 from information_schema.tables  where table_name='event_attachments') as r2_files_ok,
  exists (select 1 from information_schema.columns where table_name='calendars' and column_name='sync_direction') as r3_sync_ok,
  exists (select 1 from information_schema.columns where table_name='service_connections' and column_name='config') as r4_ok,
  exists (select 1 from information_schema.columns where table_name='events' and column_name='needs_attention') as v1_ok;
