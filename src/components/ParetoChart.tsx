/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { pareto, factById } from '../content'
import { CitationPopover } from './CitationPopover'

/**
 * Interactive concern chart. Deliberately NOT a classic Pareto with a cumulative
 * line: the quantified shares are non-exclusive "% of opponents citing" (Gallup),
 * so a cumulative curve would be dishonest. Quantified bars + qualitative ranked
 * list, each labeled for what it is (brief §7 integrity requirement).
 * Single series → single hue, direct labels, no legend (dataviz method).
 */
export function ParetoChart() {
  const [hovered, setHovered] = useState<string | null>(null)
  const max = Math.max(...pareto.quantified.map((q) => q.sharePct))

  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5 sm:p-6">
      <h3 className="text-lg font-bold text-ink">{pareto.title}</h3>

      <p className="mt-2 text-sm font-medium text-ink">
        Measured: what opponents say when pollsters ask why
      </p>
      <p className="text-xs text-ink-muted">
        % of data-center opponents citing each reason (Gallup, Mar 2026); categories
        overlap, so bars don't sum to 100%
      </p>

      <div className="mt-4 space-y-2" role="img" aria-label="Bar chart of opposition reasons from Gallup polling">
        {pareto.quantified.map((q) => {
          const fact = factById(q.factId)
          return (
            <div
              key={q.concern}
              className="group"
              onMouseEnter={() => setHovered(q.concern)}
              onMouseLeave={() => setHovered(null)}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-ink">{q.concern}</span>
                <span className="text-sm font-semibold tabular-nums text-brand-deep">
                  {q.sharePct}%
                </span>
              </div>
              <div className="mt-1 h-4 w-full rounded-sm bg-[color:var(--color-hairline)]">
                <div
                  className="h-4 rounded-sm bg-brand transition-opacity"
                  style={{
                    width: `${(q.sharePct / max) * 100}%`,
                    opacity: hovered && hovered !== q.concern ? 0.45 : 1,
                  }}
                />
              </div>
              {hovered === q.concern && fact && (
                <div className="mt-1">
                  <CitationPopover fact={fact} />
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="mt-6 text-sm font-medium text-ink">
        Ranked: what drives organized opposition on the ground
      </p>
      <p className="text-xs text-ink-muted">
        Qualitative ordering from opposition tracking and case evidence; no public
        dataset categorizes actual hearing testimony, so we don't invent percentages
      </p>
      <ol className="mt-3 space-y-2">
        {pareto.qualitative.map((q) => {
          const fact = factById(q.factId)
          return (
            <li key={q.rank} className="flex gap-3 text-sm">
              <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-wash text-xs font-bold text-brand-deep">
                {q.rank}
              </span>
              <div>
                <span className="font-medium text-ink">{q.concern}.</span>{' '}
                <span className="text-ink-secondary">{q.evidence}</span>{' '}
                {fact && <CitationPopover fact={fact} />}
              </div>
            </li>
          )
        })}
      </ol>

      <details className="mt-5 rounded-lg bg-[color:var(--color-hairline)]/50 p-3 text-sm text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink">
          How this chart was built (and its limits)
        </summary>
        <p className="mt-2">{pareto.methodology}</p>
        <p className="mt-2">{pareto.phaseNote}</p>
      </details>
    </div>
  )
}
