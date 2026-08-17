# CLAUDE.md: agent onboarding for this repository

You are working on "Data Centers, Answered With Data" (v1.0), a BitsBeTrippin
project built with Claude support. Read this file fully before changing
anything. Companion docs: `docs/REQUIREMENTS.md` (what this site must be) and
`docs/INTEGRATION.md` (how to integrate it into bitsbetrippin.io).

## Non-negotiable rules

1. **No unattributed statistics.** Every number rendered anywhere must come
   from a fact record in `src/content/facts.json` (schema in
   `src/content/types.ts`). Run `node scripts/validate-content.mjs` after any
   content change; CI runs it before deploy and fails the build on violations.
2. **Label honestly.** Industry-tier facts require `companyReported: true`.
   Modeled projections carry `modeled: true`. Where credible studies disagree
   (electricity rates, property values), present the disagreement; never pick
   a side silently.
3. **Style: no em dashes or en dashes** in any site content or code comments.
   Use commas, colons, periods, or parentheses. Plain hyphens in numeric
   ranges (18-36) and compound words (closed-loop) are correct. Check with:
   `grep -rn "—\|–" src/` (the → arrow in PowerPathDiagram's comment is the
   only allowed special dash-adjacent character).
4. **Keep the AI transparency notice** on the home page and the attribution
   banner comments in source files.
5. **Negative findings stay in.** Credibility over advocacy is the product.

## Architecture in one minute

- React 18 + Vite + TypeScript + Tailwind v4 (tokens in
  `src/styles/index.css`, palette follows a validated accessible system).
- BrowserRouter with basename '/datacenters' and Vite base '/datacenters/':
  the app is a path-based subsite of bitsbetrippin.io on Cloudflare Pages
  plus a Worker route (see docs/INTEGRATION.md). Local dev serves at
  localhost:5173/datacenters/. Do not remove the basename without also
  changing the Vite base and the deploy config.
- All content is data: `src/content/*.json` (facts, concerns, faq, rumorfact,
  explainers, pareto, case-studies, twin, bigpicture, playbook, noiselevels).
  Pages are thin renderers over this layer. To change what the site says,
  change the JSON; to change how it looks, change components.
- Interactive tools (`src/components/tools/`) embed sourced constants with
  methodology accordions; if you change a constant, update its methodology
  text and the underlying fact record together.
- Accessibility: 4-level font scale via `:root[data-fontscale]`, dark mode via
  `[data-theme="dark"]` (a selected palette, not an auto-flip), hover
  affordance ring on interactive elements, reduced-motion handling on
  animations.

## Working conventions

- Verify builds with `npm run build` (tsc + vite); validate content with
  `node scripts/validate-content.mjs`; check dashes with the grep above.
- Fact records: prefer original sources over aggregators; write `caveats`
  honestly; use tier per the hierarchy (government > academic > independent >
  industry > community) and never launder an industry claim upward.
- Sources are re-verified quarterly (first due ~Nov 2026); this research
  field moves fast. `linkcheck` pattern: HEAD/GET over facts.json URLs;
  bot-blocked (403) news sites are usually fine.
- Known open items are listed at the end of docs/REQUIREMENTS.md.
