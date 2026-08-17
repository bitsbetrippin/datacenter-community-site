/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import type { FactRecord } from '../content/types'
import { SourceBadge } from './SourceBadge'

/**
 * "Don't take our word for it": every rendered claim carries one of these.
 * Uses native <details> for zero-JS accessibility (keyboard + screen reader friendly).
 */
export function CitationPopover({ fact }: { fact: FactRecord }) {
  return (
    <details className="group relative inline-block">
      <summary className="cursor-pointer list-none text-sm font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-deep">
        Source ▸
      </summary>
      <div className="absolute left-0 z-20 mt-2 w-80 max-w-[85vw] rounded-lg border border-[color:var(--color-hairline)] bg-surface p-4 shadow-lg">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <SourceBadge tier={fact.tier} />
          {fact.companyReported && (
            <span className="text-xs font-medium text-ink-muted">company-reported</span>
          )}
          {fact.modeled && (
            <span className="text-xs font-medium text-ink-muted">modeled / projected</span>
          )}
        </div>
        <p className="text-sm font-semibold text-ink">{fact.sourceTitle}</p>
        <p className="text-sm text-ink-secondary">
          {fact.sourceOrg} · {new Date(fact.pubDate + 'T00:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'short' })} · {fact.geography}
        </p>
        {fact.methodologyNote && (
          <p className="mt-2 text-xs text-ink-secondary">
            <span className="font-medium">Method:</span> {fact.methodologyNote}
          </p>
        )}
        {fact.caveats && (
          <p className="mt-2 text-xs text-ink-secondary">
            <span className="font-medium">Caveats:</span> {fact.caveats}
          </p>
        )}
        <a
          href={fact.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-block text-sm font-medium text-brand hover:text-brand-deep"
        >
          Open the original source ↗
        </a>
      </div>
    </details>
  )
}
