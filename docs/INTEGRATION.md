# Integrating this site into bitsbetrippin.io

Audience: a future Claude agent or developer tasked with folding "Data
Centers, Answered With Data" into the main BitsBeTrippin site. Read CLAUDE.md
first for the non-negotiable rules; this doc covers the mechanics.

## What this app is, structurally

A fully static, self-contained React SPA. `npm run build` emits `dist/`
(HTML + one JS bundle + one CSS file, ~150 KB gzipped, no server, no
database, no API calls at runtime). All content ships inside the bundle from
`src/content/*.json`. Anything that can serve static files can host it.

## Integration options, in order of effort

1. **Subdomain (lowest risk): datacenters.bitsbetrippin.io.** Deploy `dist/`
   as-is (Azure Static Web Apps config included; any static host works). Add
   DNS + a link from the main site. No code changes required.
2. **Subpath: bitsbetrippin.io/datacenters.** Set Vite `base: '/datacenters/'`
   in `vite.config.ts`, switch HashRouter to BrowserRouter with
   `basename="/datacenters"` in `src/App.tsx`, and route that path prefix to
   this app's `dist/` in the main site's hosting config (rewrite rules in
   `staticwebapp.config.json` show the pattern).
3. **Full merge into the main site's framework.** Port `src/content/` (the
   valuable asset) and the page components. The content layer is
   framework-agnostic JSON; components are standard React and assume only
   Tailwind v4 tokens. Keep `scripts/validate-content.mjs` wired into the
   merged CI, or the integrity guarantee is lost.

## Theming to BitsBeTrippin brand

All colors are CSS custom properties in `src/styles/index.css` (`@theme`
block plus the `[data-theme="dark"]` overrides). Swap the token values, not
component classes. Constraint: the palette was validated for color-blind
safety and contrast (categorical slots, status colors, light + dark). If you
re-skin, re-validate: series colors need ~ΔE ≥ 8 under CVD simulation and
3:1 contrast on their surface, or add direct labels. Status colors
(good/warning/critical) must remain distinct from brand colors.

## Things that must survive integration

- The content integrity gate in CI (validator before deploy).
- Citation popovers on every statistic; Source Library page.
- The AI transparency notice (home) and attribution headers.
- The no-em-dash style rule for any new content.
- Accessibility features: font-scale toggle (root `data-fontscale`), dark
  mode (`data-theme`), reduced-motion guards, focus rings, hover affordance.
- Footer integrity statement.

## Update workflows the main site should adopt

- **Quarterly source re-check** (first due ~Nov 2026): run the linkcheck
  pattern over facts.json URLs, refresh figures whose sources updated
  (LBNL/EPRI projections, polls, PJM auctions move fast), bump `pubDate`.
- **Adding facts:** append to facts.json following types.ts; validator
  enforces schema; tag concerns from the fixed id list.
- **Adding FAQ entries:** every numeric claim needs a factId.

## Repo layout cheat sheet

- `src/content/`: all words and numbers (JSON) + types + loaders
- `src/components/`: design system + charts + `tools/` calculators
- `src/pages/`: one file per route; `src/App.tsx`: routes; nav in `components/Layout.tsx`
- `scripts/validate-content.mjs`: the integrity gate
- `.github/workflows/`: CI/CD (needs `AZURE_STATIC_WEB_APPS_API_TOKEN` secret)
- `docs/`: this file + REQUIREMENTS.md; root `CLAUDE.md`: agent rules
