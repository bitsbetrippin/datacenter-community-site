# Upgrading from Release 2 to Release 3

Release 3 turns the app into an integration hub: connect Google Calendar and
Microsoft/Outlook accounts, pick which calendars the household sees, and get
two-way sync with conflict protection — external tokens never touch the
browser.

As requested, everything that CAN ship in code does: the database migration
creates and seeds the whole service registry, the sync engine and schedules
ride the existing 5-minute cron (no wrangler.jsonc changes this release), and
the app itself walks you through the only two things that genuinely can't be
scripted from outside — creating the OAuth apps in Google's and Microsoft's
consoles. The Integrations page shows those instructions with the exact
redirect URLs for your deployment pre-filled, and detects when the secrets
appear.

## The upgrade (2 steps)

1. **Copy the new files over your repo** — unzip `family-calendar-r3.zip` into
   your repo folder, replacing when asked. (`wrangler.jsonc` is again not in
   the zip; nothing in it needs to change this release.)
2. **Commit and push** in GitHub Desktop. CI applies migration 5 (registry +
   sync tables, seeded with the Google/Microsoft/CalDAV/ICS provider profiles)
   and redeploys the Worker.

That's it for deployment. The rest happens in the app.

## In the app (Owner/Admin): Settings → Integrations

Open **Integrations** in the left nav. You'll see a "One-time provider setup"
card for any provider whose secrets aren't configured yet. Follow it —
it's copy-paste with your exact URLs shown in the page:

- **Google** (~5 min): Google Cloud console → enable Calendar API → OAuth
  consent screen in *Testing* mode with your family Gmails as test users →
  create a Web OAuth client with the redirect URI the card shows → paste the
  Client ID/Secret into the Worker as secrets `GOOGLE_CLIENT_ID` /
  `GOOGLE_CLIENT_SECRET` (Cloudflare → Worker → Settings → Variables and
  Secrets).
- **Microsoft** (~5 min): entra.microsoft.com → App registration (personal +
  org accounts) with the shown redirect URI → create a client secret → paste
  as `MS_CLIENT_ID` / `MS_CLIENT_SECRET`.

Reload the page after adding secrets — the Connect buttons activate. Then:

1. **Connect Google Calendar** → Google sign-in → approve → you land back on
   the Integrations page.
2. **Calendars…** → tick the calendars the household should see, choose
   *Two-way sync* or *Import only* per calendar → **Save & sync**. First sync
   runs immediately; afterwards it runs automatically every ~5 minutes.
3. Repeat for Microsoft, and for a spouse's account (multiple accounts per
   provider are supported — each person connects theirs).

## How sync behaves (what to expect)

- Remote events appear on your calendar with a source note in the event card;
  read-only ("Import only") calendars show no Edit/Delete buttons.
- Local edits on two-way calendars push out within a sync cycle; pushes never
  send Google invite emails to attendees.
- If the SAME event is edited both here and in Google/Outlook between syncs,
  neither side is discarded — a **Sync conflicts** section appears on the
  Integrations page and whoever resolves it picks "Keep mine" or "Use theirs".
- If an account's login expires, the connection flips to **Attention
  required** with a Reconnect button; local data is untouched (sync pauses).
- Microsoft pushes change notifications to the app (updates arrive fast);
  Google is polled every 5 minutes — Google's push channels require a
  verified custom domain, which is planned for later, and polling is
  more than fine for a household.

## Verify Release 3 (exit checklist)

- [ ] Google: connect, select calendars, remote events appear locally.
- [ ] Create an event here on a two-way Google calendar → it appears in
      Google Calendar (no invite emails sent).
- [ ] Edit that event in Google → the change lands here within ~5 minutes.
- [ ] Microsoft: connect, delta sync works, an edit in Outlook shows up here.
- [ ] Edit the same event in BOTH places between syncs → a conflict appears
      on Integrations; resolving "Keep mine" pushes your version back out.
- [ ] Delete a synced event in the provider → it disappears here (soft-deleted).
- [ ] Browser DevTools → Network: no refresh tokens or client secrets in any
      response (they live server-side only; even the Owner can't query them).
- [ ] Disconnect a provider → local events remain; status shows Disconnected.
- [ ] Turn off Wi-Fi on the provider side of your test (or pause the
      connection): the local calendar stays fully usable.

Tag `v3.0.0` when the checklist passes. Release 4 (CalDAV, ICS feeds, wall
display, hardening, PDF/PPT export) is next.

## Troubleshooting

- **Connect button greyed out** — secrets not visible to the Worker yet;
  check the names exactly (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `MS_CLIENT_ID`, `MS_CLIENT_SECRET`), then redeploy or wait a minute and
  reload.
- **Google "access blocked" at sign-in** — your Gmail isn't in the consent
  screen's Test users list, or the redirect URI doesn't match exactly.
- **`redirect_uri_mismatch`** — copy the URI from the setup card again,
  character for character.
- **Sync says attention required** — click Test for the reason; usually
  Reconnect fixes it (refresh token expired).
- **Nothing syncs** — Cloudflare → Worker → Logs: each cycle logs a
  `{"job":"sync", ...}` line with per-connection counts and a correlation id.
