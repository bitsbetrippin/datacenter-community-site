# Backup & restore strategy (§15 Backup & Export)

## What protects your data, in layers

1. **Supabase automated backups** — the hosted Postgres database is backed
   up daily by Supabase (see your plan's retention in the dashboard under
   Database → Backups). This is the primary disaster-recovery layer.
2. **Household JSON backup** — Settings → Backup & export downloads every
   household table (events, calendars, categories, people, attendees,
   reminders, recurrence rules, attachment metadata, members) as one JSON
   file. Keep a copy somewhere safe a couple of times a year.
3. **ICS export** — calendar page → ⋯ → Export .ics produces a standards
   file any calendar product can import. This is the "portability" copy.
4. **Git** — the application itself (code + schema migrations) is fully
   reproducible from the repository.

## Restore playbook

- **Deleted an event:** Undo toast (8 seconds), or ask an Admin — soft-deleted
  events remain restorable for 30 days (Settings → Audit shows who/when).
- **Database disaster:** restore the Supabase backup from the dashboard
  (Database → Backups → Restore). Everything returns as of the snapshot.
- **Moving to a new Supabase project:** create the project, let CI apply all
  migrations to it (or paste them in order), then re-import calendars from
  the ICS export, or write the JSON backup back with a small script — the
  JSON's table names and columns match the schema one-to-one.
- **Leaving the app entirely:** the ICS export is the portable artifact;
  every mainstream calendar imports it.

## Not covered by the JSON backup

- **Attachment files** — metadata is included; the files live in Supabase
  Storage and are covered by Supabase's infrastructure. Download anything
  irreplaceable separately.
- **Provider tokens** — never exported by design; reconnect accounts after
  any restore.
