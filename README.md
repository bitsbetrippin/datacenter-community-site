# Data Centers, Answered With Data (v1.0)

An evidence-based public education website about how data centers affect communities:
power, water, noise, taxes, jobs, and more. Built so that **every statistic links to its
original source** and the honest answer "it depends on the design" becomes something you
can explore interactively.

**Original design: BitsBeTrippin (bitsbetrippin.io). Development and site construction
support: Claude (Anthropic).** Requirements were independently validated against the
original project brief; see `docs/REQUIREMENTS.md` for the full mapping and `CREDITS.md`
for attribution. Agents and developers: read `CLAUDE.md` before making changes, and
`docs/INTEGRATION.md` for folding this into bitsbetrippin.io.

v1.0 contents: 106 sourced fact records, 10 concern explainers, a 109-question FAQ,
4 interactive calculators, a clickable facility tour, 11 case studies, a trade-offs
scorecard, and the community-acceptance playbook (commitment dashboard model, 20
strategies, engagement timeline).

## What's inside

- `src/content/` — the content layer. `facts.json` holds *fact records* (claim, value,
  source, date, tier, URL, confidence, caveats). `concerns.json`, `faq.json`, and
  `case-studies.json` reference facts by id. **This is the only approved way to put a
  number on a page.**
- `src/components/` — design system: `FactCard`, `CitationPopover` ("Don't take our word
  for it"), `LevelTabs` (30-second answer / learn more / source data), `ConcernCard`,
  `SourceBadge`, `Layout` (with dark mode).
- `src/pages/` — Home (hero + concern hub), ConcernPage (3-level template), Sources
  (filterable evidence library), About (integrity rules).
- `scripts/validate-content.mjs` — fails the build if any fact is missing required
  source fields or any page content references a nonexistent fact.
- `.github/workflows/` — CI/CD to Azure Static Web Apps with the content gate.

## Run it locally (no coding experience needed)

1. Install [Node.js LTS](https://nodejs.org) (accept the defaults).
2. Open a terminal in this folder and run:

   ```bash
   npm install
   npm run dev
   ```

3. Open the address it prints plus the subsite path (usually
   `http://localhost:5173/datacenters/`).

Other commands: `npm run build` (production build into `dist/`),
`node scripts/validate-content.mjs` (content integrity check).

## Deploy: subsite of bitsbetrippin.io (Cloudflare)

This app ships as a path-based subsite at **bitsbetrippin.io/datacenters**:
its own Cloudflare Pages project (build command `npm run build:cf`, output
`dist-cf`) plus a Worker route on `bitsbetrippin.io/datacenters*`. The full
walkthrough, the Worker script, and the main-site nav snippet are in
`docs/INTEGRATION.md` and `cloudflare/datacenters-proxy-worker.js`.
Supabase is not required; the site is fully static.

Fallback: the same `dist/` output also deploys to Azure Static Web Apps or any
static host (legacy workflow in `.github/workflows/`); adjust `base` in
`vite.config.ts` and the router `basename` in `src/App.tsx` if serving from
the domain root.

## Content rules (non-negotiable)

1. No unattributed statistics — every number renders with a citation to a live URL.
2. Industry figures are labeled *company-reported*; projections are labeled *modeled*.
3. Contested topics (rates, property values) present the disagreement, not one side.
4. Negative findings stay in. Credibility over advocacy.
