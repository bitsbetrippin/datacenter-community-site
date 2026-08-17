/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { WaterSimulator } from '../components/tools/WaterSimulator'
import { EconomicCalculator } from '../components/tools/EconomicCalculator'
import { NoiseCalculator } from '../components/tools/NoiseCalculator'
import { WhatIfExplorer } from '../components/tools/WhatIfExplorer'

export function Tools() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          "It depends on the design." Prove it to yourself.
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          The honest answer to most data center questions depends on how the facility is
          designed and what's written into the deal. These tools let you change the
          assumptions and watch the answers change. Every model shows its methodology and
          its limits.
        </p>
      </header>
      <WhatIfExplorer />
      <WaterSimulator />
      <NoiseCalculator />
      <EconomicCalculator />
      <p className="text-sm text-ink-muted">
        These are educational models with sourced default parameters, not predictions for
        any specific project. For a real proposal, request the site-specific water balance,
        acoustic study, and fiscal impact analysis, then compare them against these
        benchmarks.
      </p>
    </div>
  )
}
