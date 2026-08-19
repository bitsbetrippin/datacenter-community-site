# Upgrading to v1.0

v1.0 brings the fixes you asked for plus the Import center:

- **Categories**: Add form moved to the top; every group is now collapsible
  with a count badge; create your own **named custom groups** and add
  categories under them.
- **Settings**: clear **Personal / Administration** buckets with a visible
  divider — admin functions sit in their own bordered section.
- **Role-gated signups**: new people who sign up now land in a **waiting
  room** until an Owner/Admin approves them. Pending signups appear at the
  top of Settings → Members & roles with a role picker and an Approve button.
- **📥 Import** (new left-menu item):
  - **.ics files** — Outlook "Save calendar", Apple, Google, most apps.
  - **.csv files** — Outlook desktop's Import/Export wizard and Google CSV.
  - **📷 Screenshot/photo of a calendar** — the image reader (Cloudflare
    Workers AI, free tier, no keys) extracts day + title only. You pick the
    month/year, adjust anything it misread, and assign categories.
  - Imported events missing a **time and/or category** are saved anyway but
    get a **red outline** on the calendar until someone opens them, confirms
    the time and picks a category, and saves.

## The upgrade (3 steps)

1. **Copy the new files over your repo** — unzip `family-calendar-v1.zip`
   into the repo folder, replacing when asked.
2. **One paste in wrangler.jsonc** (enables the screenshot reader): open
   `wrangler.jsonc` and add this block right after `"observability": { ... },`:

   ```jsonc
   // v1.0: Workers AI powers the screenshot import (no keys needed).
   "ai": {
     "binding": "AI"
   },
   ```

3. **Commit & push** in GitHub Desktop ("v1.0"). CI applies migration 7 and
   deploys. If the migration workflow is red, run `apply_all_missing.sql`
   (updated in this zip — now covers everything through v1.0) in the
   Supabase SQL Editor, same as before.

Check `/api/health` afterwards — it now includes `workers_ai_binding: true`
when step 2 landed.

## Verify v1.0

- [ ] Categories: Add form is at the top; groups collapse; create a new group
      (e.g. "Scouts & Clubs") and add a category into it.
- [ ] Settings shows Personal and Administration buckets with the blue rail.
- [ ] Have someone sign up fresh → they see the waiting room → they appear in
      Members & roles → Approve as Viewer → their page lets them in within
      ~30 seconds.
- [ ] Import → .ics or .csv from Outlook: preview, duplicates unchecked, import.
- [ ] Import → screenshot of a marked month grid: candidates appear, month
      auto-guessed, assign categories, import → events land on the right days
      with red outlines.
- [ ] Open a red-outlined event → banner explains what's needed → set
      time/category → save → outline clears.
- [ ] Left nav footer reads **v1.0**.

Tag **`v1.0`** in GitHub Desktop when the list passes.

## Notes

- The screenshot reader extracts titles and days ONLY, by design — no times,
  locations, or guesses. Best results: tight, sharp screenshot of just the
  calendar grid, high contrast. Photos of paper calendars work but flatten
  and crop them first if you can.
- Workers AI free tier comfortably covers household use (a screenshot import
  costs a fraction of the daily allowance). If it ever declines, the page
  says so plainly rather than failing silently.
- If a new signup should NOT be in your household (a stranger found the
  URL): simply never approve them — they can't see anything without a role.
