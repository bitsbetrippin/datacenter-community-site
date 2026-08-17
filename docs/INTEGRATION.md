# Integrating this subsite into bitsbetrippin.io

Audience: a Claude agent or developer working on the main bitsbetrippin.io
property (Cloudflare + Supabase). Read CLAUDE.md first for the
non-negotiable rules. As of v1.2.0 this repo is pre-configured for the
chosen architecture: **path-based subsite at bitsbetrippin.io/datacenters**.

## The architecture (decided 2026-08-17)

- This repo deploys as its **own Cloudflare Pages project** in the same
  Cloudflare account/zone as the main site. Independent repo, independent CI,
  independent release cadence.
- A **small Worker route** on `bitsbetrippin.io/datacenters*` proxies to the
  Pages project. The main site's code and deployment are untouched.
- The app is built with Vite `base: '/datacenters/'` and
  `BrowserRouter basename="/datacenters"`, so all URLs are clean:
  `bitsbetrippin.io/datacenters/faq`, `/datacenters/tools`, etc.
- **Supabase is not required.** The subsite is fully static; all content ships
  in the bundle. See "Future Supabase hooks" below for when that changes.

## Deploy walkthrough (one time, ~20 minutes)

### 1. Create the Pages project
In the Cloudflare dashboard (same account as the main site):
Workers & Pages > Create > Pages > Connect to Git > select the
`datacenter-community-site` repo.
- Build command: `npm run build:cf`
- Build output directory: `dist-cf`
- No environment variables needed.
Every push to `main` now deploys; PRs get preview URLs automatically.
The build output nests the app under `/datacenters` with a `_redirects` file
(SPA fallback + root redirect), so the Pages URL serves
`<project>.pages.dev/datacenters/` with production-identical paths.

### 2. Create the Worker route
`cloudflare/datacenters-proxy-worker.js` in this repo is the complete Worker
(setup steps in its header comment): paste it into a new Worker, set the
`PAGES_HOST` variable to the Pages host, and add the route
`bitsbetrippin.io/datacenters*` on the bitsbetrippin.io zone (plus the
`www.` variant if www is not already redirected at the edge).

### 3. Link from the main site
Add a nav entry in the main site pointing to `/datacenters/`. Suggested label:
"Data Centers, Answered With Data". Because it is the same origin, a plain
anchor works; no CORS, no iframe, no special handling.

### 4. Verify
- `bitsbetrippin.io/datacenters/` loads the home page
- A deep link (`/datacenters/faq`) loads directly (SPA fallback working)
- Hashed assets return long-cache headers (Pages default, passed through)

## Theming to BitsBeTrippin brand

All colors are CSS custom properties in `src/styles/index.css` (`@theme` block
plus `[data-theme="dark"]` overrides). Swap token values, not component
classes. Constraint: the palette was validated for color-blind safety and
contrast; if re-skinned, re-validate (series colors ~ΔE >= 8 under CVD
simulation, 3:1 contrast on surface, or add direct labels). Status colors
must remain distinct from brand colors. The font stack is the system sans;
swapping in the main site's font is a one-line change in the same file.

## Things that must survive integration

- The content integrity gate (`scripts/validate-content.mjs`) in CI.
- Citation popovers on every statistic; the Source Library page.
- The AI transparency notice (home) and attribution headers.
- The no-em-dash style rule for any new content.
- Accessibility: font-scale toggle, selected dark mode, reduced-motion guards,
  focus rings, hover affordance.
- Footer integrity statement.

## Future Supabase hooks (not needed today)

If/when these features are wanted, Supabase in the existing instance is the
natural backend, called from this static app via the anon key + RLS:
- **Live commitment dashboards** (white-label): a `commitments` table
  (project, metric, target, actual, period, source_url) replacing the demo
  data in `src/pages/Playbook.tsx`.
- **Community question intake**: a form writing to a `questions` table,
  feeding future FAQ updates.
- **Feedback/corrections**: "report an issue with this fact" per fact id.
Keep all reads public/anonymous and writes rate-limited; the site must stay
fully functional with Supabase unreachable (progressive enhancement only).

## Update workflows

- Quarterly source re-check (first due ~Nov 2026): linkcheck over facts.json
  URLs; refresh fast-moving figures (LBNL/EPRI projections, polls, PJM
  auctions, BLS May-2025 OEWS wages); bump pubDates.
- Adding facts: append to facts.json per types.ts; validator enforces schema.
- Adding FAQ entries: every numeric claim needs a factId.
- Release process: bump package.json version, CHANGELOG entry, git tag.

## Repo layout cheat sheet

- `src/content/`: all words and numbers (JSON) + types + loaders
- `src/components/`: design system + charts + `tools/` calculators
- `src/pages/`: one file per route; `src/App.tsx`: routes; nav in `components/Layout.tsx`
- `scripts/validate-content.mjs`: integrity gate; `scripts/package-cf.mjs`: Cloudflare packaging
- `cloudflare/datacenters-proxy-worker.js`: the Worker for the path route
- `.github/workflows/`: legacy Azure SWA pipeline (superseded by Cloudflare
  Pages git integration; safe to delete once Cloudflare is live)
- `docs/`: this file + REQUIREMENTS.md; root `CLAUDE.md`: agent rules
