# Credits

## Original design and direction
**BitsBeTrippin** (bitsbetrippin.io) authored the original project brief: a
comprehensive, evidence-first framework for data center community education,
including the concern taxonomy, the Question → Fact → Context → Evidence →
Mitigation → Commitment → Measurement → Independent Verification model, the
three-level information architecture, and the requirement that the site read as
"an interactive tool that allows me to investigate for myself" rather than
developer advocacy.

## Development and site construction support
**Claude** (Anthropic) supported the project across seven research waves and
five releases: source gathering and cross-checking, the fact-record content
architecture, interactive tool construction (calculators, simulators, the
facility tour), and site engineering.

## Independent validation
Requirements were independently validated against the original project brief.
The mapping from each section of the original ask to its implementation lives
in `docs/REQUIREMENTS.md`. The automated content gate
(`scripts/validate-content.mjs`) enforces the brief's integrity rules on every
build: no unattributed statistics, industry claims labeled company-reported,
modeled projections labeled as modeled, and no content referencing a source
that does not exist.

## Research sources
The evidence base draws on government and regulatory sources (LBNL, JLARC,
EIA, EPA, FHWA, county governments), academic research, independent research
organizations, industry disclosures (labeled as such), and local reporting.
Every fact record with its full citation is in `src/content/facts.json` and
rendered in the site's Source Library.
