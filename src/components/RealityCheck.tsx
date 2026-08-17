/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import realityCheckData from '../content/realitycheck.json'
import { factById } from '../content'
import { CitationPopover } from './CitationPopover'

interface RealityCheckItem {
  id: string
  claim: string
  direction: string
  verdict: string
  whatDataShows: string
  factIds: string[]
}

const data = realityCheckData as { intro: string; items: RealityCheckItem[] }

const verdictStyle = (verdict: string) => {
  if (verdict.startsWith('not supported')) {
    return 'bg-[#fbe4e4] text-[#8f2222] dark:bg-[#3a1515] dark:text-[#e66767]'
  }
  if (verdict === 'usually overstated' || verdict === 'half true, half false') {
    return 'bg-[#fdf3e0] text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]'
  }
  return 'bg-brand-wash text-brand-deep'
}

export function RealityCheck() {
  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5 sm:p-6">
      <h3 className="text-lg font-bold text-ink">
        Reality check: popular claims vs. the data
      </h3>
      <p className="mt-1 text-sm text-ink-secondary">{data.intro}</p>
      <div className="mt-4 space-y-3">
        {data.items.map((item) => {
          const itemFacts = item.factIds
            .map((id) => factById(id))
            .filter((f): f is NonNullable<typeof f> => Boolean(f))
          return (
            <details key={item.id} className="group rounded-lg border border-[color:var(--color-hairline)]">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
                      {item.direction}
                    </p>
                    <p className="mt-0.5 text-sm font-semibold text-ink">"{item.claim}"</p>
                  </div>
                  <span className="mt-0.5 shrink-0 text-brand transition-transform group-open:rotate-90">▸</span>
                </div>
                <span className={`mt-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${verdictStyle(item.verdict)}`}>
                  {item.verdict}
                </span>
              </summary>
              <div className="border-t border-[color:var(--color-hairline)] p-4 pt-3">
                <p className="text-sm leading-relaxed text-ink-secondary">{item.whatDataShows}</p>
                {itemFacts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {itemFacts.map((f) => (
                      <CitationPopover key={f.id} fact={f} />
                    ))}
                  </div>
                )}
              </div>
            </details>
          )
        })}
      </div>
    </div>
  )
}
