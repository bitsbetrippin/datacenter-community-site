# Changelog

## v1.0.0 (2026-08-16)

First tagged release. A BitsBeTrippin project built with Claude support.

Added in v1.0:
- Text-size toggle in the header: 4 levels (0-3), each step ~2pt larger, persisted per visitor
- Larger section headers with edge shadow for clearer section scanning
- Hover highlight ring on every interactive element (links, buttons, expanders, selects, sliders)
- Attribution headers across all source files; CREDITS.md
- Agent-facing context docs (CLAUDE.md, docs/REQUIREMENTS.md, docs/INTEGRATION.md) for future bitsbetrippin.io integration
- Repository structure for GitHub: this changelog, git history, v1.0.0 tag

Carried from the R0-R4 development series (2026-08-16):
- R0: React + Vite + Tailwind foundation, design system, fact-record content architecture, content integrity validator, Azure Static Web Apps CI/CD
- R1: 54-fact evidence base (research waves 0-3), interactive opposition Pareto, Power/Water/Noise explainers with Rumor→Fact→Proof blocks, animated power-path diagram, decibel ladder
- R2: waves 4-5 research (85 facts), all 10 concern explainers, water simulator, noise distance calculator, economic impact calculator, /tools page
- R3: wave 6 research (96 facts), What-If design explorer, clickable facility tour, case study library (11 cases), trade-offs page with adjustable scorecard and industrial comparison, sitewide em-dash style pass, AI transparency notice
- R4: wave 7 research (106 facts), 109-question FAQ, playbook (commitment dashboard model, 20 acceptance strategies, 10-stage engagement timeline), persona pathways, link health check

## v1.1.0 (2026-08-17)

- Jobs section overhaul: full role and salary matrix (entry technician through principal engineer) with BLS OEWS government wage data separated from labeled self-reported aggregator figures; "Why 24/7/365 operation changes the headcount math" explainer with the sourced shift-relief arithmetic (4.2-5.4 FTEs per continuous post). The "published jobs figures are one shift, multiply by 5" claim was researched and corrected: published figures (JLARC ~50/facility) are total headcount across all shifts, while the per-seat relief ratio explains why 24/7 campuses with NOC/SOC operations carry headcounts in the hundreds.
- Reality Check section on the home page: 10 popular claims (6 heard in opposition, 4 heard from promoters) each tested against the evidence base with verdicts and citations.
- Sitewide neutrality pass: 31 editorial adjustments so opposition claims and industry claims receive identical scrutiny; all documented findings and caveats retained.
- Evidence base grown to 116 fact records (BLS wage data, ISC2, shift-relief factor, Uptime staffing guidance).

## v1.2.0 (2026-08-17)

- Converted to a path-based subsite of bitsbetrippin.io: Vite base and BrowserRouter basename set to /datacenters, clean URLs (bitsbetrippin.io/datacenters/faq)
- Cloudflare deployment kit: `npm run build:cf` packaging (dist-cf with nested app + _redirects SPA fallback), Worker proxy script (cloudflare/datacenters-proxy-worker.js) with dashboard setup steps for the bitsbetrippin.io/datacenters* route
- docs/INTEGRATION.md rewritten Cloudflare-first: deploy walkthrough, main-site nav snippet, theming constraints, future Supabase hooks (live commitment dashboards, question intake); Supabase not required today
- README and CLAUDE.md updated for the subsite architecture; Azure workflow retained as legacy fallback

## v1.2.1 (2026-08-17)

- Added wrangler.jsonc so the git-connected Cloudflare Workers build is fully repo-driven: worker name datacentercommunitysite, static assets served from dist-cf, optional commented routes block for future automation
- docs/INTEGRATION.md deploy walkthrough rewritten for the as-deployed single-Worker flow (no proxy worker needed); proxy worker script retained as legacy alternative
