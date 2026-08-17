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

## Deploy walkthrough (as deployed: Cloudflare Workers git flow)

Production uses Cloudflare's newer git-connected WORKERS flow (not classic
Pages). One Worker serves the static site AND owns the /datacenters route;
no separate proxy worker is needed. Everything the build needs lives in the
repo: `wrangler.jsonc` (worker name, assets directory) and the
`npm run build:cf` packaging script.

### 1. The Worker (one time)
Workers & Pages > Create > Workers > import the `datacenter-community-site`
Git repository.
- Build command: `npm run build:cf`
- Deploy command: `npx wrangler deploy`
- Path / root directory: leave BLANK (it is the repo root, not the output
  directory; the output directory is declared in wrangler.jsonc)
- API token: any account build token works; permission warnings about
  unrelated products (email routing) are ignorable.
Every push to `main` builds and deploys; non-production branches upload
preview versions via `npx wrangler versions upload`.

### 2. The route (one time)
Worker > Settings > Domains & Routes > Add > Route:
`bitsbetrippin.io/datacenters*` on the bitsbetrippin.io zone (plus the
`www.` twin if www is not redirected at the edge). Cloudflare sends each
request to the most specific match, so this wins over the main website
worker for /datacenters paths and nothing else changes. (Optional: automate
by uncommenting the `routes` block in wrangler.jsonc once the build token
has Workers Routes edit permission on the zone.)

### 3. Link from the main site
Add a nav entry in the main site pointing to `/datacenters/`. Same origin,
plain anchor, no CORS or iframe handling.

### 4. Verify
- `bitsbetrippin.io/datacenters/` loads the home page
- A deep link (`/datacenters/faq`) loads directly (SPA fallback via
  `_redirects` in the build output)
- Hashed assets return long-cache headers

Legacy alternatives kept in the repo: `cloudflare/datacenters-proxy-worker.js`
(only needed if the site ever moves to a classic Pages project) and the Azure
Static Web Apps workflow in `.github/workflows/`.

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
