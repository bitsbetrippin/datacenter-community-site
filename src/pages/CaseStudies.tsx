/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { caseStudies } from '../content'
import type { CaseStudy } from '../content/types'

const OUTCOMES: { key: CaseStudy['outcome'] | 'all'; label: string }[] = [
  { key: 'all', label: 'All outcomes' },
  { key: 'approved', label: 'Approved smoothly' },
  { key: 'approved-after-opposition', label: 'Approved despite opposition' },
  { key: 'modified', label: 'Rules changed after problems' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'moratorium', label: 'Moratorium / ban' },
]

const outcomeStyle: Record<CaseStudy['outcome'], string> = {
  approved: 'bg-[#e2f2e2] text-[#1d6b1d] dark:bg-[#173517] dark:text-[#6fbf6f]',
  'approved-after-opposition': 'bg-[#fdf3e0] text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]',
  modified: 'bg-brand-wash text-brand-deep',
  rejected: 'bg-[#fbe4e4] text-[#8f2222] dark:bg-[#3a1515] dark:text-[#e66767]',
  moratorium: 'bg-[#fbe4e4] text-[#8f2222] dark:bg-[#3a1515] dark:text-[#e66767]',
}

export function CaseStudies() {
  const [filter, setFilter] = useState<CaseStudy['outcome'] | 'all'>('all')
  const shown = filter === 'all' ? caseStudies : caseStudies.filter((c) => c.outcome === filter)

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          What actually happened in other communities
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          Eleven documented cases: approvals, fights, reversals, and bans. For each one,
          the question that matters is not just what happened but why the community
          reacted the way it did.
        </p>
      </header>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by outcome">
        {OUTCOMES.map((o) => (
          <button key={o.key} onClick={() => setFilter(o.key)} aria-pressed={filter === o.key}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === o.key
                ? 'bg-brand text-white'
                : 'bg-[color:var(--color-hairline)] text-ink-secondary hover:text-ink'
            }`}>
            {o.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {shown.map((cs) => (
          <article key={cs.id} className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
            <div className="flex items-start justify-between gap-2">
              <h2 className="font-semibold text-ink">{cs.location}, {cs.state}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${outcomeStyle[cs.outcome]}`}>
                {OUTCOMES.find((o) => o.key === cs.outcome)?.label}
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{cs.summary}</p>
            <p className="mt-2 text-sm leading-relaxed text-ink">
              <span className="font-medium">Why the community reacted this way: </span>
              {cs.whyCommunityReacted}
            </p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
              {cs.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="text-xs font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-deep">
                  {s.title} ↗
                </a>
              ))}
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
