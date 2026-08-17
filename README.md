# Data Centers, Answered With Data

**Current version: v1.2.2** · [Changelog](CHANGELOG.md) ·
**Live:** [bitsbetrippin.io/datacenters](https://www.bitsbetrippin.io/datacenters/) ·
[Preview (workers.dev)](https://datacenter-community-site.bitsbetrippin.workers.dev/datacenters/)

An evidence-based public education website about how data centers affect the
communities around them: power, water, noise, taxes, jobs, property, land use,
construction, safety, and the environment. The site is built on one rule:
**no unattributed statistics.** Every number links to its original source,
labels whether it is measured or modeled, and says whether it comes from
independent research or the industry itself. Where credible studies disagree,
the site shows the disagreement. The honest answer to many questions is "it
depends on how the facility is designed," so the site makes that explorable
instead of just saying it.

**Original design: BitsBeTrippin ([bitsbetrippin.io](https://www.bitsbetrippin.io)).
Development and site construction support: Claude (Anthropic).** Requirements
were independently validated against the original project brief; see
`docs/REQUIREMENTS.md` for the full mapping and `CREDITS.md` for attribution.

## What's on the site

- **10 concern explainers**, each with a 30-second answer, a deeper dive, and
  the raw sources (three-level information model)
- **32 Rumor / Fact / Proof blocks**: the question as residents ask it, the
  honest answer, why people are concerned, what determines the outcome, and
  how to verify it yourself
- **116 sourced fact records** from 7 research waves, browsable in the Source
  Library with tier labels (government, academic, independent, industry,
  community)
- **4 interactive tools**: What-If facility designer, water simulator, noise
  distance calculator, economic impact calculator, each with visible
  methodology and honest caveats
- **Facility tour**: a clickable campus map explaining what each component
  is, its community impact, mitigation, and how to monitor it
- **11 case studies** of real communities (approved, fought, rejected,
  banned) with why each community reacted the way it did
- **Trade-offs page**: two-sided receives/accepts ledger, a user-weighted
  priorities scorecard, industrial-use comparison, and future-tech status
- **Community playbook**: a commitment-dashboard model, 20 acceptance
  strategies with evidence and KPIs, and a 10-stage engagement timeline
- **109-question FAQ**, searchable, every answer cited
- **Reality Check**: popular claims from both directions tested against the
  evidence base
- Accessibility: 4-level text-size control, dark mode, keyboard support,
  reduced-motion handling

## Versioning

Semantic-style tags: the middle digit increments for feature releases, the
last digit for deployment and bug fixes. Full history in
[CHANGELOG.md](CHANGELOG.md); tags v1.0.0 through v1.2.2 are in the repo, and
GitHub Releases mirror the tags.

## Run it locally

1. Install [Node.js LTS](https://nodejs.org).
2. In this folder: `npm install` then `npm run dev`
3. Open `http://localhost:5173/datacenters/`

Other commands: `npm run build` (production build), `npm run build:cf`
(Cloudflare packaging into `dist-cf/`), `node scripts/validate-content.mjs`
(content integrity gate: fails if any statistic lacks a sourced fact record).

## Deployment

The site deploys automatically: every push to `main` triggers a Cloudflare
Workers build (`npm run build:cf`, then `npx wrangler deploy` driven by
`wrangler.jsonc`). Static assets serve directly; `cloudflare/worker.js`
handles the root redirect and SPA deep-link fallback. A route on
`bitsbetrippin.io/datacenters*` puts it on the main domain. Full architecture
and integration notes: `docs/INTEGRATION.md`.

## For contributors and agents

Read `CLAUDE.md` first: it carries the non-negotiable content rules (sourcing,
labeling, neutrality, style) and the architecture summary. The content layer
is data: everything the site says lives in `src/content/*.json`; pages are
thin renderers. The PR template enforces the integrity checklist.

## Content rules (non-negotiable)

1. No unattributed statistics; every number renders with a citation to a live URL.
2. Industry figures are labeled company-reported; projections are labeled modeled.
3. Contested topics (rates, property values) present the disagreement, not one side.
4. Opposition claims and industry claims receive identical scrutiny.
5. Negative findings stay in. Credibility over advocacy.
