# Family Calendar — v1.1

A private household calendar: sign in, see the big family calendar, create and
manage events with color-coded categories, and control who in the family can
do what. Release 1 is intentionally **local-only** — external calendar sync
(Google, Microsoft, CalDAV, ICS) arrives in Releases 2–4 per the project's
Release Overview.

## Stack

| Layer | Technology |
| --- | --- |
| Client | React 18 + Vite + TypeScript, FullCalendar for the calendar views |
| Edge | Cloudflare Worker (serves the SPA + `/api/*` endpoints), deployed to the built-in `workers.dev` subdomain |
| Data | Supabase Postgres with Row Level Security, Supabase Auth |
| CI/CD | GitHub Actions (build check + Supabase migrations), Cloudflare Workers Builds (deploy on push to `main`) |

## What's in Release 4

The plan's final release — standards adapters, hardening, and household polish:

- **ICS subscription feeds**: read-only auto-refreshing subscriptions to any
  published .ics URL, with ETag/Last-Modified friendly fetching
- **CalDAV foundation**: discovery, calendar selection, ctag/etag
  incremental sync, and two-way pushes (iCloud app passwords, Fastmail,
  Nextcloud, Synology, …)
- **Wall display mode** (`/wall`): big type, clock, weather slot,
  auto-refresh — built for a mounted tablet with a Viewer account
- **High-fidelity export**: print-optimized vector month view for PDF, and
  real .pptx generation (editable text, category colors)
- **Backup & export**: one-click household JSON archive + BACKUP.md restore
  playbook
- **Themes**: Classic / Forest / Ocean / Sunset per-user palettes — the
  seasonal-pack foundation
- **Hardening**: API rate limiting, hourly retention purge (30-day
  soft-delete horizon), default event category (CAT-003), accessibility
  touches (skip link, Escape handling), installable PWA manifest

Upgrading from R3? See **[UPGRADE_R4.md](./UPGRADE_R4.md)** — two steps,
with a SQL-editor fallback included.

## What's in Release 3

The integration hub (§13–§14 of the requirements):

- Admin-managed **service registry** seeded with Google, Microsoft, CalDAV,
  ICS, jCal/xCal and generic REST profiles (capabilities, endpoints, field
  mappings, sync behavior all registry-visible)
- **Google Calendar**: OAuth2 + PKCE, incremental sync via sync tokens,
  two-way pushes with If-Match etags, recurring series + exceptions
- **Microsoft 365 / Outlook**: OAuth2 + PKCE, delta sync, change
  notifications with automatic subscription renewal
- **Sync engine**: idempotent job queue with backoff, per-calendar cursors,
  snapshot-hash echo prevention, tombstones, and a conflict system that never
  silently discards either side — conflicts are resolved by a human on the
  Integrations page
- **Token security**: provider tokens AES-GCM-encrypted in a table no client
  role can read; OAuth code exchange happens only in the Worker
- Integrations UI: connect/reconnect, per-calendar sync direction, health
  states, Test connection, manual Sync now, disconnect-with-retention
- Setup is self-guiding: the app detects missing provider secrets and shows
  copy-paste console instructions with this deployment's exact redirect URIs

Upgrading from R2? See **[UPGRADE_R3.md](./UPGRADE_R3.md)** — two steps.

## What was in Release 2

Everything the household does *inside* the app (external provider sync is R3):

- People: shared contacts, attendees with roles (driver, child, observer…), RSVP
- Repeating events (daily/weekdays/weekly/monthly/yearly) with per-occurrence,
  whole-series, and this-and-future edits — RRULE-compatible storage
- Reminders (multiple per event, "just me" or "whole household") delivered as
  in-app notifications by a Worker cron every 5 minutes, idempotently
- Attachments in a private Supabase Storage bucket (25 MB, safe types only)
- Admin console: category editor (rename/recolor/reorder/merge/archive),
  append-only audit log, appearance settings, optional two-factor auth
- Global search (title, description, location, people, categories, filenames)
- Drag-and-drop rescheduling, undo for deletions, keyboard shortcuts
  (n, t, 1–5, /), saved filters, upcoming panel with quick add
- ICS import (preview + duplicate detection) and export, printable views
- Live refresh across devices via Supabase Realtime
- Birthdays & anniversaries from contacts shown automatically

Upgrading from R1? See **[UPGRADE_R2.md](./UPGRADE_R2.md)**.

## What was in Release 1

- Email/password sign in, sign up, password reset (Supabase Auth)
- Household with Owner / Admin / User / Viewer roles, enforced by Postgres RLS
  (not just hidden buttons — a Viewer cannot mutate data even with direct API calls)
- Month, Week, Day, Agenda, and Year calendar views; Today/prev/next/date navigation
- Event create / edit / duplicate / soft-delete with validation (end must follow start)
- 100 seeded household categories (Appendix A) with color bubbles on the calendar
- Filters by category and calendar, kept in the URL so views are bookmarkable
- Distinct visual states for canceled / tentative / private / all-day events
- Settings: profile, household defaults, members & roles, local calendars
- Worker API shell (`/api/health`, `/api/me`) establishing the server-side
  JWT + membership validation pattern later releases build on

## Getting started

Follow **[SETUP.md](./SETUP.md)** — it walks through Supabase, Cloudflare,
GitHub, and first sign-in step by step.

Local development quick reference:

```bash
cp .env.example .env      # fill in your Supabase URL + anon key
npm install
npm run dev               # client + Worker locally with hot reload
npm run build             # type-check + production build (what CI runs)
```

## Repository layout

```
src/                  React client
  components/         Shell, EventModal, EventDetail, FilterBar
  context/            Auth + Household state
  pages/              SignIn/SignUp/Reset, Onboarding, Calendar, Settings
  lib/                Supabase client, types, event utilities
worker/               Cloudflare Worker (API + SPA serving)
supabase/migrations/  Versioned SQL — schema, RLS, RPCs, category seeds
.github/workflows/    CI build check + Supabase migration deploy
```

## Rules of the road

- **Never** edit the database schema in the Supabase dashboard. Every schema
  change is a SQL file in `supabase/migrations/` so Git stays the source of truth.
- **Never** put the Supabase `service_role` key (or any secret) in client code
  or `VITE_*` variables. The anon key is public by design; RLS does the protecting.
- Deploys happen by merging to `main` (push with GitHub Desktop). Tag releases
  (`v1.0.0`, …) at the commit that completes a release's exit criteria.
