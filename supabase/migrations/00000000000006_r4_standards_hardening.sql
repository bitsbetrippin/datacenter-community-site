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
