/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { facts, tierLabels } from '../content'
import { FactCard } from '../components/FactCard'
import type { SourceTier } from '../content/types'

const tiers: (SourceTier | 'all')[] = [
  'all',
  'government',
  'academic',
  'independent',
  'industry',
  'community',
]

export function Sources() {
  const [tier, setTier] = useState<SourceTier | 'all'>('all')
  const shown = tier === 'all' ? facts : facts.filter((f) => f.tier === tier)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Don't take our word for it.
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          Every fact used anywhere on this site lives here, with its source, publication
          date, methodology notes, and caveats. Filter by who produced the research.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by source type">
        {tiers.map((t) => (
          <button
            key={t}
            onClick={() => setTier(t)}
            aria-pressed={tier === t}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              tier === t
                ? 'bg-brand text-white'
                : 'bg-[color:var(--color-hairline)] text-ink-secondary hover:text-ink'
            }`}
          >
            {t === 'all' ? 'All sources' : tierLabels[t]}
          </button>
        ))}
      </div>

      <p className="text-sm text-ink-muted">
        {shown.length} of {facts.length} fact records · growing with every research wave
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {shown.map((f) => (
          <FactCard key={f.id} fact={f} />
        ))}
      </div>
    </div>
  )
}
