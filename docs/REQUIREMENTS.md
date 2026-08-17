# Requirements: the original ask and where each part lives

Original designer: BitsBeTrippin. This document is the clean requirements read
for any agent or developer joining the project, mapping the original brief
("Data Center Community Acceptance, Public Education, Community Engagement and
Go To Market Strategy") to its implementation. Independent validation of the
original ask was performed against this mapping at v1.0.

## The one-sentence product requirement

The site must feel like "an interactive tool that allows me to investigate for
myself whether this project is good for my community," never like "a developer
trying to convince me that a data center is good."

## Guiding flow (must survive any redesign)

Question → Fact → Context → Evidence → Mitigation → Commitment → Measurement →
Independent Verification.

## Brief-to-implementation map

| Original ask | Implementation | Status |
| --- | --- | --- |
| Evidence library w/ tiered sources, full citation schema (brief §4-5) | `src/content/facts.json` (106 records), Source Library page, CitationPopover on every claim | Done |
| Top ~20 community concerns (§6) | 10 concern categories + trust tag; concern hub + explainers | Done |
| Pareto analysis, honest about data limits (§7) | Home ParetoChart: Gallup quantified shares + qualitative tracker ranking, methodology disclosure; no invented percentages | Done (quantitative-hybrid; transcript-coding upgrade in backlog) |
| Concern matrix WHAT/WHY/HOW/WHO/VERIFY (§8) | Rumor→Fact→Proof blocks (32) + FAQ (109) + explainers | Done |
| Design variance: "not every data center is the same" (§9) | What-If explorer, cooling comparisons in water simulator, twin content | Done |
| Power education & rate truth (§10) | Power explainer (two-regimes rate answer), power-path diagram, grid R-F-P blocks | Done |
| Water education + "Where Does The Water Go?" simulator (§11) | Water explainer + WaterSimulator | Done |
| Noise education + interactive comparison (§12) | Noise explainer, decibel ladder, NoiseCalculator | Done (calibrated audio version in backlog) |
| Economic impact + calculator (§13) | Taxes/Jobs explainers + EconomicCalculator with honest-caveats accordion | Done |
| Community benefit agreements (§14) | Wave 4 research, Lancaster CBA fact + strategy #6 | Done |
| 20 executable acceptance strategies w/ scoring (§15, §34) | Playbook page: 20 strategies, cost/difficulty/impact, evidence, precedent, KPI, phase tiers | Done |
| Engagement timeline w/ swimlanes (§16) | Playbook timeline: 10 stages × developer/municipality/utility + residents-can-demand | Done |
| Rumor → Fact → Proof model (§17) | RumorFact component, used across all explainers | Done |
| Website IA: question-first landing, concern picker (§18) | Home hero + Pareto + concern hub | Done |
| Visualization program (§19) | Pareto, power-path animation, decibel ladder, comparison table; Sankeys in backlog | Substantially done |
| Digital twin (§20) | Tour page: clickable campus schematic, 9 components, 5 fields each | Done |
| What-If tool (§21) | WhatIfExplorer | Done |
| Commitment dashboard (§22) | Playbook working model with demo data + real precedents | Done (live per-project data is a white-label feature) |
| Independent verification model (§23) | Verify-it-yourself fields everywhere, Source Library, "How to verify" on every twin component | Done |
| 100+ question FAQ (§24) | 109 questions, searchable, all cited | Done |
| Communication personas (§25) | Home "Start where you are" pathways (9 personas) | Done |
| Three-level information model (§26) | LevelTabs on every concern page | Done |
| Sentiment journey, what-not-to-do, trust science (§27-29) | Wave 0/7 research; playbook framing; case studies "why the community reacted" | Done |
| Risk/benefit two-sided + scorecard (§30-31) | Trade-offs page: receives/accepts ledger + user-weighted scorecard (labeled non-scientific) | Done |
| Competing industrial uses (§32) | Trade-offs comparison table with defensibility note | Done |
| Future technology, deployed vs speculative (§33) | Trade-offs future-tech status grid | Done |
| Research integrity rules (§38) | validate-content.mjs gate + labeling conventions | Done, automated |

## Key product decisions of record

- General education platform, not a project-specific template (white-label is
  a post-launch feature).
- Loudoun County is always framed as the extreme upper bound, never typical.
- The rates question is presented as two true answers in two regimes.
- Property-value evidence is presented as genuinely mixed.
- Style rule: no em/en dashes anywhere in site content.
- AI transparency notice stays on the home page.

## Known open items (backlog)

Audio noise tool with calibrated samples; Sankey diagrams (tax and water
flows); GIS/interactive maps; hearing-transcript coding to upgrade the Pareto;
live commitment-dashboard data (white-label); CRS R49057 retrieval; Prince
William ordinance text verification; LBNL Fig 4.4 per-architecture WUE
transcription; quarterly source re-verification (first due ~Nov 2026).
