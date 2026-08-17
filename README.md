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

3. Open the address it prints (usually `http://localhost:5173`).

Other commands: `npm run build` (production build into `dist/`),
`node scripts/validate-content.mjs` (content integrity check).

## Deploy to Azure Static Web Apps (one-time setup, ~15 minutes)

1. Push this folder to a GitHub repository (GitHub Desktop is the easiest way:
   File → Add local repository → Publish).
2. In the [Azure Portal](https://portal.azure.com), create a resource → **Static Web
   App** → Free plan. Sign in with GitHub when prompted and pick your repo + `main`
   branch. Build presets: **Custom** — app location `/`, output location `dist`.
3. Azure adds a deployment token to your repo automatically. If you use the included
   workflow file instead, add the token as a repo secret named
   `AZURE_STATIC_WEB_APPS_API_TOKEN` (Repo → Settings → Secrets → Actions).
4. Every push to `main` now deploys automatically; pull requests get preview URLs.

AWS fallback: the same `dist/` output deploys to AWS Amplify Hosting unchanged.

## Content rules (non-negotiable)

1. No unattributed statistics — every number renders with a citation to a live URL.
2. Industry figures are labeled *company-reported*; projections are labeled *modeled*.
3. Contested topics (rates, property values) present the disagreement, not one side.
4. Negative findings stay in. Credibility over advocacy.
