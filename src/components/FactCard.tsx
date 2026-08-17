/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import type { FactRecord } from '../content/types'
import { CitationPopover } from './CitationPopover'

/** A single sourced claim. The only approved way to put a statistic on a page. */
export function FactCard({ fact }: { fact: FactRecord }) {
  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      {fact.value && (
        <p className="mb-1 text-lg font-semibold text-brand-deep">{fact.value}</p>
      )}
      <p className="text-[15px] leading-relaxed text-ink">{fact.claim}</p>
      {fact.caveats && (
        <p className="mt-2 text-sm text-ink-secondary">
          <span className="font-medium">Worth knowing:</span> {fact.caveats}
        </p>
      )}
      <div className="mt-3">
        <CitationPopover fact={fact} />
      </div>
    </div>
  )
}
