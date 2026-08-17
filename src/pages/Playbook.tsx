/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { playbook } from '../content'
import type { Strategy } from '../content'

const TIERS: { key: Strategy['tier'] | 'all'; label: string }[] = [
  { key: 'all', label: 'All 20 strategies' },
  { key: 'quick-win', label: 'Quick wins' },
  { key: 'pre-entitlement', label: 'Before approval' },
  { key: 'construction', label: 'During construction' },
  { key: 'long-term', label: 'Long-term operations' },
]

const levelStyle: Record<string, string> = {
  low: 'text-[color:var(--color-status-good)]',
  medium: 'text-[#8a5a00] dark:text-[#eda100]',
  high: 'text-[color:var(--color-status-critical)]',
}

/** Demo commitment dashboard (brief §22): promises as measurable, publicly tracked numbers. */
const DEMO_COMMITMENTS = [
  { commitment: 'Property-line noise (night)', target: '< 45 dBA', actual: '41 dBA', status: 'good' },
  { commitment: 'Potable water use', target: '< 150,000 gal/day', actual: '112,000 gal/day', status: 'good' },
  { commitment: 'Generator testing', target: 'Weekdays 9am-4pm only', actual: '1 after-hours test (utility outage)', status: 'warning' },
  { commitment: 'Local hiring (operations)', target: '> 25%', actual: '31%', status: 'good' },
  { commitment: 'Construction complaints resolved < 5 days', target: '> 90%', actual: '84%', status: 'warning' },
  { commitment: 'Annual third-party acoustic study', target: 'Published each June', actual: 'Published June 12', status: 'good' },
]

const statusChip: Record<string, { label: string; cls: string }> = {
  good: { label: '✓ Met', cls: 'bg-[#e2f2e2] text-[#1d6b1d] dark:bg-[#173517] dark:text-[#6fbf6f]' },
  warning: { label: '△ Attention', cls: 'bg-[#fdf3e0] text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]' },
  breach: { label: '✗ Missed', cls: 'bg-[#fbe4e4] text-[#8f2222] dark:bg-[#3a1515] dark:text-[#e66767]' },
}

export function Playbook() {
  const [tier, setTier] = useState<Strategy['tier'] | 'all'>('all')
  const shown = tier === 'all' ? playbook.strategies : playbook.strategies.filter((s) => s.tier === tier)

  return (
    <div className="space-y-12">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          The playbook: how trust actually gets built
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          For developers, officials, and residents alike: 20 executable strategies
          grounded in research and documented precedent, a commitment dashboard model
          that turns promises into measurable numbers, and an engagement timeline showing
          what should happen when. The research is blunt: more facts alone rarely change
          minds. Fair process, early honesty, and verifiable commitments do.
        </p>
      </header>

      {/* Commitment dashboard demo */}
      <section aria-labelledby="dashboard-heading">
        <h2 id="dashboard-heading" className="text-lg font-bold text-ink">
          The commitment dashboard (a working model)
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          A promise is only real if it has a number, a measurement method, and a public
          scoreboard. This is demonstration data showing what every project should
          publish; residents can demand exactly this format in any approval.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--color-hairline)] bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-hairline)] text-left">
                <th className="p-3 font-semibold text-ink">Commitment</th>
                <th className="p-3 font-semibold text-ink">Target</th>
                <th className="p-3 font-semibold text-ink">Actual (this quarter)</th>
                <th className="p-3 font-semibold text-ink">Status</th>
              </tr>
            </thead>
            <tbody className="text-ink-secondary">
              {DEMO_COMMITMENTS.map((c) => (
                <tr key={c.commitment} className="border-b border-[color:var(--color-hairline)] last:border-0">
                  <td className="p-3 font-medium text-ink">{c.commitment}</td>
                  <td className="p-3 tabular-nums">{c.target}</td>
                  <td className="p-3 tabular-nums">{c.actual}</td>
                  <td className="p-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusChip[c.status].cls}`}>
                      {statusChip[c.status].label}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-ink-muted">
          Demonstration data. The format is the point: numeric targets, measured actuals,
          third-party verification, published on a schedule. Precedents exist: Spotsylvania
          County's permit conditions, Chandler's five years of annual noise studies, and
          mining-sector Good Neighbor Agreements with independent sampling.
        </p>
      </section>

      {/* Strategies */}
      <section aria-labelledby="strategies-heading">
        <h2 id="strategies-heading" className="text-lg font-bold text-ink">
          20 community acceptance strategies
        </h2>
        <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Filter by phase">
          {TIERS.map((t) => (
            <button key={t.key} onClick={() => setTier(t.key)} aria-pressed={tier === t.key}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                tier === t.key
                  ? 'bg-brand text-white'
                  : 'bg-[color:var(--color-hairline)] text-ink-secondary hover:text-ink'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-3">
          {shown.map((s, i) => (
            <details key={s.id} className="group rounded-xl border border-[color:var(--color-hairline)] bg-surface">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-ink sm:text-base">
                      {i + 1}. {s.name}
                    </h3>
                    <p className="mt-0.5 text-sm text-ink-secondary">{s.objective}</p>
                  </div>
                  <span className="mt-0.5 shrink-0 text-brand transition-transform group-open:rotate-90">▸</span>
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">
                  Addresses: {s.concernAddressed} · Cost{' '}
                  <span className={levelStyle[s.cost]}>{s.cost}</span> · Difficulty{' '}
                  <span className={levelStyle[s.difficulty]}>{s.difficulty}</span> · Impact{' '}
                  <span className={levelStyle[s.impact] === levelStyle.high ? 'text-[color:var(--color-status-good)] font-semibold' : levelStyle[s.impact]}>{s.impact}</span>
                </p>
              </summary>
              <div className="space-y-3 border-t border-[color:var(--color-hairline)] p-4 text-sm">
                <p className="text-ink"><span className="font-medium">What: </span>{s.what}</p>
                <p className="text-ink-secondary"><span className="font-medium text-ink">Why it works: </span>{s.why}</p>
                <p className="text-ink-secondary"><span className="font-medium text-ink">How: </span>{s.how}</p>
                <p className="text-ink-secondary"><span className="font-medium text-ink">Evidence: </span>{s.evidence}</p>
                <p className="text-ink-secondary"><span className="font-medium text-ink">Precedent: </span>{s.example}</p>
                <p className="rounded-lg bg-brand-wash p-2.5 text-ink"><span className="font-medium">Measure success by: </span>{s.kpi}</p>
              </div>
            </details>
          ))}
        </div>
      </section>

      {/* Engagement timeline */}
      <section aria-labelledby="timeline-heading">
        <h2 id="timeline-heading" className="text-lg font-bold text-ink">
          The engagement timeline: what should happen when
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          From two years before an announcement through end of life. The failure pattern
          in every rejected or regretted project is the same: communities learning late.
          This is the schedule that prevents it.
        </p>
        <ol className="mt-4 space-y-4">
          {playbook.timeline.map((t, i) => (
            <li key={t.stage} className="relative rounded-xl border border-[color:var(--color-hairline)] bg-surface p-4 pl-12">
              <span className="absolute left-4 top-4 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-xs font-bold text-white">
                {i + 1}
              </span>
              <h3 className="text-sm font-semibold text-ink">
                {t.stage} <span className="font-normal text-ink-muted">({t.timing})</span>
              </h3>
              <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2">
                <div>
                  <dt className="font-bold uppercase tracking-wide text-ink-muted">Developer</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-secondary">{t.developer}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-ink-muted">Municipality</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-secondary">{t.municipality}</dd>
                </div>
                <div>
                  <dt className="font-bold uppercase tracking-wide text-ink-muted">Utility</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink-secondary">{t.utility}</dd>
                </div>
                <div className="rounded-lg bg-brand-wash p-2">
                  <dt className="font-bold uppercase tracking-wide text-brand-deep">Residents can demand</dt>
                  <dd className="mt-0.5 leading-relaxed text-ink">{t.residents}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
