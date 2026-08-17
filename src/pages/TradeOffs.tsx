/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { bigPicture } from '../content'

const statusStyle: Record<string, string> = {
  deployed: 'bg-[#e2f2e2] text-[#1d6b1d] dark:bg-[#173517] dark:text-[#6fbf6f]',
  'early-deployment': 'bg-brand-wash text-brand-deep',
  announced: 'bg-[#fdf3e0] text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]',
  speculative: 'bg-[color:var(--color-hairline)] text-ink-secondary',
}

export function TradeOffs() {
  const [weights, setWeights] = useState<Record<string, number>>(
    Object.fromEntries(bigPicture.scorecard.map((s) => [s.id, s.defaultWeight])),
  )
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0)

  return (
    <div className="space-y-10">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">The honest trade-off</h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          A data center is neither a windfall nor a catastrophe. It is a trade: real
          benefits for real impacts, with the balance decided by design choices and the
          deal your community negotiates. Both sides, side by side.
        </p>
      </header>

      {/* Two-sided ledger */}
      <section className="grid gap-4 lg:grid-cols-2" aria-label="What the community receives and accepts">
        <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
          <h2 className="font-bold text-ink">What the community receives</h2>
          <ul className="mt-3 space-y-3">
            {bigPicture.receives.map((r) => (
              <li key={r.item} className="text-sm">
                <span className="font-medium text-ink">{r.item}. </span>
                <span className="text-ink-secondary">{r.detail}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
          <h2 className="font-bold text-ink">What the community accepts</h2>
          <ul className="mt-3 space-y-3">
            {bigPicture.accepts.map((a) => (
              <li key={a.item} className="text-sm">
                <span className="font-medium text-ink">{a.item}. </span>
                <span className="text-ink-secondary">{a.detail}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Scorecard */}
      <section aria-labelledby="scorecard-heading">
        <h2 id="scorecard-heading" className="text-lg font-bold text-ink">
          What matters most to you?
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          There is no scientifically objective score for whether a project is "good."
          What communities can do is decide their own priorities. Set the weight of each
          factor for your community; use the result to structure what you ask developers
          and officials, not as a verdict.
        </p>
        <div className="mt-4 rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
          <div className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
            {bigPicture.scorecard.map((s) => (
              <label key={s.id} className="block text-sm">
                <span className="flex items-baseline justify-between">
                  <span className="text-ink">{s.label}</span>
                  <span className="font-semibold tabular-nums text-brand-deep">
                    {totalWeight > 0 ? Math.round((weights[s.id] / totalWeight) * 100) : 0}%
                  </span>
                </span>
                <input type="range" min={0} max={5} step={1} value={weights[s.id]}
                  onChange={(e) => setWeights({ ...weights, [s.id]: Number(e.target.value) })}
                  className="mt-1 w-full accent-[color:var(--color-brand)]" />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            The percentages show how much each factor counts in your personal weighting.
            Bring this list to a hearing: the factors you weighted highest are the ones
            to demand enforceable commitments on.
          </p>
        </div>
      </section>

      {/* Industrial comparison */}
      <section aria-labelledby="comparison-heading">
        <h2 id="comparison-heading" className="text-lg font-bold text-ink">
          Compared to what? The same land, three futures
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Context, not a contest. Here is how a data center compares with two realistic
          alternatives for a large industrial parcel.
        </p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-[color:var(--color-hairline)] bg-surface">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-hairline)] text-left">
                <th className="p-3 font-semibold text-ink">Factor</th>
                {bigPicture.comparison.rows.map((r) => (
                  <th key={r.use} className="p-3 font-semibold text-ink">{r.use}</th>
                ))}
              </tr>
            </thead>
            <tbody className="align-top text-ink-secondary">
              {(['jobs', 'power', 'water', 'truckTraffic', 'taxRevenue'] as const).map((field) => (
                <tr key={field} className="border-b border-[color:var(--color-hairline)] last:border-0">
                  <td className="p-3 font-medium text-ink">
                    {{ jobs: 'Jobs', power: 'Power', water: 'Water', truckTraffic: 'Truck traffic', taxRevenue: 'Tax revenue' }[field]}
                  </td>
                  {bigPicture.comparison.rows.map((r) => (
                    <td key={r.use} className="p-3 text-xs leading-relaxed">{r[field]}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="mt-3 rounded-lg bg-[color:var(--color-hairline)]/50 p-3 text-xs text-ink-secondary">
          <summary className="cursor-pointer font-medium text-ink">
            Limits of this comparison (read before quoting it)
          </summary>
          <p className="mt-2">{bigPicture.comparison.defensibilityNote}</p>
          <p className="mt-2">
            Sources:{' '}
            {bigPicture.comparison.sources.map((s, i) => (
              <span key={s.url}>
                {i > 0 && ' · '}
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-brand hover:text-brand-deep">
                  {s.title}
                </a>
              </span>
            ))}
          </p>
        </details>
      </section>

      {/* Future tech */}
      <section aria-labelledby="future-heading">
        <h2 id="future-heading" className="text-lg font-bold text-ink">
          Technology that could shrink these impacts (and what's real today)
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-ink-secondary">
          Developers often promise future technology. Here is the current status of each,
          separating what is deployed from what is announced.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {bigPicture.futureTech.map((t) => (
            <div key={t.tech} className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink">{t.tech}</h3>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusStyle[t.status]}`}>
                  {t.status.replace('-', ' ')}
                </span>
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{t.summary}</p>
              <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer"
                className="mt-2 inline-block text-xs font-medium text-brand underline decoration-dotted underline-offset-4 hover:text-brand-deep">
                Source ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
