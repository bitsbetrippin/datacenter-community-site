/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { noiseLevels } from '../content'

/**
 * dBA reference ladder: everyday sounds (gray), data-center sources (brand blue),
 * and regulatory limits (marked line). Two categories + a threshold → color follows
 * entity type; direct labels on every bar; legend row present (dataviz method).
 */
export function NoiseLadder() {
  const sorted = [...noiseLevels].sort((a, b) => a.dBA - b.dBA)
  const max = 110

  return (
    <figure className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <figcaption className="mb-1 text-sm font-semibold text-ink">
        How loud is that? A decibel reference ladder
      </figcaption>
      <p className="mb-3 text-xs text-ink-muted">
        dBA at the listed distance. Remember: −6 dB per doubling of distance, and a
        constant hum at 50-65 dBA is a sleep/annoyance issue, not a hearing-damage one.
      </p>
      <div className="mb-3 flex gap-4 text-xs text-ink-secondary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-[color:var(--color-baseline)]" /> Everyday sound
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded-sm bg-brand" /> Data center source
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-ink" /> Typical night limit
        </span>
      </div>
      <div className="space-y-2">
        {sorted.map((l) =>
          l.category === 'limit' ? (
            <div key={l.label} className="relative py-1">
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-ink"
                style={{ left: `${(l.dBA / max) * 100}%` }}
                aria-hidden="true"
              />
              <p
                className="text-xs font-medium text-ink"
                style={{ marginLeft: `calc(${(l.dBA / max) * 100}% + 8px)` }}
              >
                {l.label}: ~{l.dBA} dBA
              </p>
            </div>
          ) : (
            <div key={l.label}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{l.label}</span>
                <span className="text-sm font-semibold tabular-nums text-ink-secondary">
                  {l.dBA} dBA
                </span>
              </div>
              <div className="mt-0.5 h-3 w-full rounded-sm bg-[color:var(--color-hairline)]">
                <div
                  className={`h-3 rounded-sm ${l.category === 'datacenter' ? 'bg-brand' : 'bg-[color:var(--color-baseline)]'}`}
                  style={{ width: `${(l.dBA / max) * 100}%` }}
                />
              </div>
            </div>
          ),
        )}
      </div>
      <p className="mt-3 text-xs text-ink-muted">
        Sources: CDC everyday-sound guidance; EESI and community acoustic compilations for
        data center figures (upper bounds; replace with the project's filed acoustic study
        when one exists).
      </p>
    </figure>
  )
}
