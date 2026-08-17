/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import type { RumorFactBlock } from '../content/types'
import { factById } from '../content'
import { CitationPopover } from './CitationPopover'

/** Rumor → Fact → Proof block (brief §17): question, honest answer, origin, determinants, verification. */
export function RumorFact({ block }: { block: RumorFactBlock }) {
  const blockFacts = block.factIds
    .map((id) => factById(id))
    .filter((f): f is NonNullable<typeof f> => Boolean(f))

  return (
    <details className="group rounded-xl border border-[color:var(--color-hairline)] bg-surface">
      <summary className="cursor-pointer list-none p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-base font-semibold text-ink">"{block.question}"</h3>
          <span className="mt-1 text-brand transition-transform group-open:rotate-90">▸</span>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{block.shortAnswer}</p>
      </summary>
      <div className="space-y-4 border-t border-[color:var(--color-hairline)] p-5 pt-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            Why people are concerned
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{block.whyConcerned}</p>
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
            What determines the answer
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{block.whatDetermines}</p>
        </div>
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-bold uppercase tracking-wide text-brand-deep">
            Verify it yourself
          </p>
          <p className="mt-1 text-sm leading-relaxed text-ink">{block.verify}</p>
        </div>
        {blockFacts.length > 0 && (
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
              The evidence behind this answer
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
              {blockFacts.map((f) => (
                <CitationPopover key={f.id} fact={f} />
              ))}
            </div>
          </div>
        )}
      </div>
    </details>
  )
}
