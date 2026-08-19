# Upgrading from Release 3 to Release 4

Release 4 completes the original plan: CalDAV and calendar-feed support, a
wall display mode for a kitchen tablet, razor-sharp PDF and PowerPoint
export, household backup, themes, and a hardening pass (rate limiting, data
retention, accessibility).

## The upgrade (2 steps — same as R3)

1. **Copy the new files over your repo** — unzip `family-calendar-r4.zip`
   into your repo folder, replacing when asked. (`wrangler.jsonc` is not in
   the zip; nothing in it changes this release.)
2. **Commit & push** in GitHub Desktop. CI applies migration 6 and redeploys.

**If the migration workflow comes up red again:** the zip includes
`apply_all_missing.sql` — paste it into the Supabase SQL Editor and run it,
exactly like last time. It applies migration 6 only if missing and records
it in the history. Then the app works regardless of CI's mood.

No new secrets, no wrangler changes, no console visits this release.

## What's new, where to find it

- **Calendar feeds (.ics URLs)** — Integrations → "Subscribe & standards".
  Paste any published calendar URL (school district, sports team, holidays).
  Read-only, refreshes every ~30 minutes with bandwidth-friendly caching.
- **CalDAV** — same section. Works with iCloud (app-specific password +
  `https://caldav.icloud.com/`), Fastmail, Nextcloud, Synology, etc.
  After connecting, click **Calendars…** to choose collections and two-way
  or import-only per calendar — exactly like Google/Microsoft.
- **Wall display** — user menu (top right) → **🖥 Wall display**, or go to
  `/wall`. Big type, clock, auto-refresh, no admin chrome. Tip: create a
  **Viewer** account for the kitchen tablet, sign it in once, and leave
  `/wall` open full-screen. Escape (or the faint ✕) exits.
- **PDF / PowerPoint export** — user menu → **🖨 Export PDF / PPT** (or the
  ⋯ menu). Pick the month and calendar; "PDF / Print" produces true vector
  output via the print dialog (choose Save as PDF + Landscape); "PowerPoint"
  downloads a real .pptx with the month grid — colors intact, text editable.
- **Backup** — Settings → "Backup & export" (Owner/Admin): one JSON file of
  the whole household. See BACKUP.md for the restore strategy.
- **Themes** — Settings → Appearance: Classic, Forest, Ocean, Sunset. The
  seasonal packs (Christmas, Halloween…) will plug into this same selector.
- **Default category** — Settings → Household: pick the category new events
  preselect. Also there: the birthdays on/off toggle.
- **Hardening you won't see:** API rate limiting, hourly cleanup of expired
  data (soft-deleted events purge for good after 30 days — undo stays
  instant, permanence just arrives on schedule), keyboard/screen-reader
  improvements, installable app manifest (⋯ menu → "Install app" in Chrome).

## Verify Release 4 (final acceptance — closes out the whole plan)

- [ ] Subscribe to a public .ics feed URL → its events appear (read-only).
- [ ] Connect a CalDAV account (iCloud app password is the easiest test) →
      pick a calendar → events flow in; create an event on it here → appears
      on the phone's calendar.  *(This is the §20.1 CalDAV checklist item.)*
- [ ] `/wall` looks right on the tablet/TV it'll live on.
- [ ] Export the current month: PDF is crisp at any zoom; the .pptx opens in
      PowerPoint with editable text.
- [ ] Backup downloads and the JSON opens/parses.
- [ ] Switch theme → whole app recolors instantly; other members unaffected.
- [ ] New event preselects the household default category.
- [ ] Delete an event → Undo works as before (permanent purge happens ~30
      days later, automatically).

Tag **`v4.0.0`** — that's every release in the original Release Overview
delivered. 🎉  From here: seasonal theme packs, email/SMS reminder channels,
natural-language quick add, a custom domain (which unlocks Google push
notifications), whenever you want them.
