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
