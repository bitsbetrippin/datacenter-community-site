# Setup Guide — from zip file to live family calendar

Follow these parts in order. You'll need about 30–45 minutes the first time.
Nothing here requires writing code — it's all clicking through dashboards and
pasting values.

---

## Part A — Accounts and tools

You need (all free tiers are fine for Release 1):

1. A **GitHub** account, with **GitHub Desktop** installed and signed in.
2. A **Supabase** account — https://supabase.com
3. Your existing **Cloudflare** account.
4. *(Optional, only for running locally)* **Node.js 22 LTS** — https://nodejs.org

---

## Part B — Create the Supabase project (the database)

1. In Supabase, click **New project**.
   - Name: `family-calendar`
   - **Database password:** choose a strong one and **save it** — you'll need it in Part E.
   - Region: pick the one closest to you (e.g. US Central/East).
2. When the project finishes provisioning, go to **Project Settings → API** and copy two values somewhere handy:
   - **Project URL** — looks like `https://abcd1234.supabase.co`
   - **anon / public key** — a long string. (This one is safe to expose. Never copy the `service_role` key anywhere.)
   The `abcd1234` part of the URL is your **project ref** — note it too.

3. **Apply the database migrations** (one-time manual step; CI does it automatically afterward):
   - In Supabase, open **SQL Editor → New query**.
   - Open the file `supabase/migrations/00000000000001_foundation.sql` from this
     repo in a text editor, copy ALL of it, paste into the SQL editor, click **Run**.
     You should see "Success. No rows returned".
   - Repeat with `supabase/migrations/00000000000002_seeds_and_rpcs.sql`.

4. **Auth settings** — go to **Authentication → Sign In / Up → Email**:
   - Make sure the **Email** provider is enabled.
   - **Confirm email:** for a private family app the simplest choice is to turn
     confirmation **off** (family members can sign in immediately after signing
     up). Leave it on if you prefer the extra safety — members will click a
     link in their email first.

---

## Part C — (Optional) run it on your computer first

Skip to Part D if you'd rather go straight to the cloud.

```bash
cd family-calendar
copy .env.example .env      # (macOS/Linux: cp .env.example .env)
```

Edit `.env` and paste your Project URL and anon key. Then:

```bash
npm install
npm run dev
```

Open the printed local URL, create your account, and you should land in
household onboarding.

---

## Part D — Put the code on GitHub (with GitHub Desktop)

1. Unzip `family-calendar.zip` somewhere permanent (e.g. `Documents\Projects\family-calendar`).
2. Before publishing, make one small edit: open **`wrangler.jsonc`** in a text
   editor and replace the two placeholder values in `"vars"` with your real
   **Project URL** and **anon key** from Part B. (Both are public-safe.)
3. In GitHub Desktop: **File → Add local repository** → choose the folder.
   If it says the folder isn't a repository, click "create a repository here" —
   keep the suggested settings.
4. Commit everything (summary: `Release 1 initial import`), then click
   **Publish repository**. Keep it **Private**.

From now on, your workflow is: make changes → commit in GitHub Desktop →
**Push origin**. Pushes to `main` deploy automatically once Parts E and F are done.

---

## Part E — Automated database migrations (GitHub Actions)

This makes future database changes apply themselves when you push.

1. On github.com, open your new repository → **Settings → Secrets and variables → Actions → New repository secret**. Add three secrets:
   - `SUPABASE_ACCESS_TOKEN` — create at supabase.com → click your avatar → **Account settings** → **Access tokens** → Generate new token.
   - `SUPABASE_PROJECT_REF` — the `abcd1234` part of your project URL.
   - `SUPABASE_DB_PASSWORD` — the database password from Part B step 1.
2. That's it. The workflow in `.github/workflows/supabase-migrations.yml` runs
   whenever a file in `supabase/migrations/` changes on `main`. (You already
   applied migrations 1 and 2 by hand, and the Supabase CLI keeps track, so it
   won't re-run them — first run may show them as already applied.)

---

## Part F — Deploy on Cloudflare (Workers Builds → workers.dev)

1. In the Cloudflare dashboard: **Workers & Pages → Create → Workers →
   Import a repository** (connect your GitHub account if prompted) → pick the
   `family-calendar` repository.
2. Configure the build:
   - **Build command:** `npm run build`
   - **Deploy command:** `npx wrangler deploy`
3. Add **build environment variables** (there's an "Environment variables"
   section in the build configuration):
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon key
4. Save and deploy. When the build finishes you'll get your app URL:
   `https://family-calendar.<your-account>.workers.dev`
   (Make sure the **workers.dev** route/subdomain is enabled on the Worker —
   it is by default.)
5. Back in **Supabase → Authentication → URL Configuration**:
   - **Site URL:** your workers.dev URL
   - **Redirect URLs:** add `https://family-calendar.<your-account>.workers.dev/*`
   This makes password-reset links land back on your app.

From now on: every push to `main` rebuilds and redeploys automatically, and
pull-request branches get preview URLs.

---

## Part G — First run: create the household

1. Open your workers.dev URL → **Create an account** (this first account will
   be the household **Owner** — make it yours).
2. You'll land on **Set up your household** → name it, confirm the timezone →
   **Create household**. This also seeds the default "Family" calendar and all
   100 categories automatically.
3. Have each family member open the same URL on their device and **Sign up**
   with their own email.
4. As Owner, go to **Settings → Members & roles → Add a member**, enter each
   person's email and pick a role:
   - **Admin** — a co-parent: manage members, settings, all events
   - **User** — can create and manage their own events
   - **Viewer** — read-only (nice for a wall tablet or younger kids)

---

## Part H — Verify Release 1 (exit checklist)

- [ ] Calendar is the first thing you see after signing in; Month/Week/Day/Agenda/Year all work.
- [ ] Clicking an empty day/slot opens New Event with the date/time pre-filled.
- [ ] An event with a category shows that category's color bubble on the calendar.
- [ ] Filters (Categories / Calendars) narrow the view, and the URL reflects them.
- [ ] A **Viewer** account sees events but has no Add/Edit/Delete controls — and
      cannot create events even via the API (RLS blocks it; verified in development).
- [ ] Editing an event to end before it starts shows an inline error and won't save.
- [ ] Password reset email round-trips back to your workers.dev URL.
- [ ] Pushing a commit with GitHub Desktop redeploys the site automatically.

When all boxes are checked, tag the release: in GitHub Desktop use
**Repository → Create tag** on the latest commit (`v1.0.0`) — that's Release 1
done, and Release 2 work can start on branches.

---

## Troubleshooting

- **"Missing Supabase configuration" on the deployed site** — the two `VITE_*`
  build environment variables aren't set in the Cloudflare build config (Part F step 3).
- **Sign-up works but sign-in says confirmation required** — turn off Confirm
  email (Part B step 4) or click the link in the confirmation email.
- **Password reset link goes to localhost** — set Site URL / Redirect URLs (Part F step 5).
- **"No account found for that email" when adding a member** — they must sign
  up themselves first; adding them doesn't create an account (by design).
- **Migration workflow fails** — check the three secrets in Part E; the DB
  password is the one from project creation (you can reset it in Supabase
  under Project Settings → Database).
