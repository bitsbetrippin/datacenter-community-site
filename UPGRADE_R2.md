# Upgrading from Release 1 to Release 2

Release 2 adds: people & RSVP, repeating events, reminders with in-app
notifications, file attachments, the admin console (category editor, audit
log, appearance), global search, drag-and-drop rescheduling, undo, keyboard
shortcuts, ICS import/export, and live refresh across devices.

The upgrade is four short steps. Your data is untouched — the new database
migrations only ADD tables and columns.

---

## Step 1 — Copy the new files over your repo

1. Close the app folder in any editors.
2. Unzip `family-calendar-r2.zip` and copy everything **into your existing
   repo folder**, replacing files when asked.
   (The zip deliberately does NOT contain `wrangler.jsonc`, so your Worker
   name and Supabase values are safe.)

## Step 2 — Add the reminder schedule to wrangler.jsonc

Open `wrangler.jsonc` in a text editor and add the `triggers` block right
after the `observability` block (keep everything else exactly as it is):

```jsonc
  "observability": {
    "enabled": true
  },
  // R2: reminder delivery runs every 5 minutes (in-app notifications).
  "triggers": {
    "crons": ["*/5 * * * *"]
  },
```

## Step 3 — Give the Worker the service-role key (for reminders only)

The reminder cron writes notifications for every family member, so it needs
the Supabase service-role key — stored as a **Worker secret**, never in code:

1. Supabase dashboard → **Project Settings → API** → copy the `service_role` key
   (⚠️ this key bypasses row security — it only ever goes into the next step).
2. Cloudflare dashboard → your Worker → **Settings → Variables and Secrets** →
   **Add** → type **Secret** → name `SUPABASE_SERVICE_ROLE_KEY` → paste → Save.

While you're there, confirm `SUPABASE_URL` and `SUPABASE_ANON_KEY` exist as
plain-text variables on the Worker (they're in your `wrangler.jsonc` `vars`
already, so they should).

## Step 4 — Commit and push

In GitHub Desktop: review the changes → commit (`Release 2`) → **Push origin**.

That push does everything else automatically:
- the Supabase migrations workflow applies migrations 3 and 4
  (new tables + the private `attachments` storage bucket), and
- Cloudflare Workers Builds redeploys the app with the cron schedule.

Wait for both to go green (GitHub → Actions tab; Cloudflare → your Worker →
Deployments), then hard-refresh the app (Ctrl/Cmd+Shift+R).

---

## One-time optional switches

- **Two-factor auth:** to let family members enroll an authenticator app,
  enable TOTP in Supabase → **Authentication → Multi-Factor** first.
- **Live refresh:** if events don't appear on a second device without a
  reload, check Supabase → **Database → Replication** and make sure the
  `supabase_realtime` publication includes `events` and `notifications`
  (the migration adds them automatically on standard projects).

## Verify Release 2 (exit checklist)

- [ ] Create a weekly repeating event → it appears on future weeks with the ↻ mark.
- [ ] Edit one occurrence ("This event only") → only that one changes.
- [ ] Delete one occurrence → only that one disappears; Undo brings it back.
- [ ] Add a family member as an attendee → they can RSVP from the event card,
      and the response shows for everyone.
- [ ] Add a reminder "10 minutes before / whole household" to a near-future
      event → within ~5 minutes of the due time, the 🔔 bell lights up for members.
- [ ] Drop a PDF onto an event's card → it uploads; a signed-out browser tab
      cannot open the file URL.
- [ ] Settings → Categories: rename + recolor a category → calendar bubbles
      update immediately; the change appears in Settings → Audit.
- [ ] Search (press `/`) finds events by title, person, and attachment name.
- [ ] Drag an event to another day in Week view → it stays after reload.
- [ ] Import a school `.ics` → preview appears, duplicates unchecked; export
      your calendar and open the `.ics` in Google Calendar successfully.
- [ ] Two browsers open side by side: creating an event in one appears in the
      other without a manual refresh.

When all boxes pass, tag `v2.0.0` in GitHub Desktop. Release 3 (Google +
Microsoft sync) is next.

## Troubleshooting

- **Migration workflow fails on "storage" policies** — rare on older
  projects: open Supabase → SQL Editor and run the contents of
  `supabase/migrations/00000000000004_r2_attachments.sql` manually, then
  re-run the failed GitHub Action.
- **No reminder notifications** — check the Worker secret from Step 3 exists,
  then Cloudflare → Worker → Logs while waiting for a 5-minute tick; the log
  line `{"job":"reminders", ...}` shows each run.
- **Attachment upload rejected** — the bucket allows PDF, Office, text/CSV,
  and image types up to 25 MB. Executables are rejected by design (§11).
