/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { twin } from '../content'

/**
 * Digital twin facility tour (brief §20): a clickable campus map where each
 * component explains what it is, why it exists, its community impact, how the
 * impact is mitigated, and how residents can monitor it.
 */
export function Tour() {
  const [activeId, setActiveId] = useState<string>('cooling')
  const active = twin.find((c) => c.id === activeId)!

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          Tour the facility before it exists.
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          Click any part of the campus. Each one explains what it is, why it exists, what
          impact it can have on neighbors, how that impact is mitigated, and how you can
          verify it with public records.
        </p>
      </header>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Campus map */}
        <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-4">
          <svg viewBox="0 0 100 84" role="group" aria-label="Interactive data center campus map">
            <rect x={2} y={2} width={96} height={80} rx={2}
              fill="none" stroke="var(--color-baseline)" strokeWidth={0.6} strokeDasharray="2 1.5" />
            <text x={4} y={7} fontSize={3} fill="var(--color-ink-muted)">Property line</text>
            {twin.map((c) => (
              <g key={c.id} onClick={() => setActiveId(c.id)} className="cursor-pointer"
                role="button" aria-label={c.name} tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && setActiveId(c.id)}>
                <rect x={c.x} y={c.y} width={c.w} height={c.h} rx={1.5}
                  fill={activeId === c.id ? 'var(--color-brand)' : 'var(--color-brand-wash)'}
                  stroke={activeId === c.id ? 'var(--color-brand-deep)' : 'var(--color-baseline)'}
                  strokeWidth={0.4} />
                <text x={c.x + c.w / 2} y={c.y + c.h / 2 - 1} textAnchor="middle" fontSize={c.w > 12 ? 5 : 4}>
                  {c.icon}
                </text>
                {c.w >= 10 && (
                  <text x={c.x + c.w / 2} y={c.y + c.h / 2 + 4.5} textAnchor="middle" fontSize={2.3}
                    fill={activeId === c.id ? '#ffffff' : 'var(--color-ink)'} fontWeight={600}>
                    {c.name.length > 14 ? c.name.split(' ')[0] : c.name}
                  </text>
                )}
              </g>
            ))}
          </svg>
          <p className="mt-2 text-xs text-ink-muted">
            Schematic layout, not to scale. Real campuses vary; site plans filed with the
            county show the actual arrangement.
          </p>
        </div>

        {/* Detail panel */}
        <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
          <h2 className="text-lg font-bold text-ink">
            <span aria-hidden="true">{active.icon}</span> {active.name}
          </h2>
          <dl className="mt-3 space-y-3 text-sm">
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">What it is</dt>
              <dd className="mt-0.5 leading-relaxed text-ink">{active.whatItIs}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Why it exists</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-secondary">{active.whyItExists}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">Community impact</dt>
              <dd className="mt-0.5 leading-relaxed text-ink">{active.communityImpact}</dd>
            </div>
            <div>
              <dt className="text-xs font-bold uppercase tracking-wide text-ink-muted">How it's mitigated</dt>
              <dd className="mt-0.5 leading-relaxed text-ink-secondary">{active.mitigation}</dd>
            </div>
            <div className="rounded-lg bg-brand-wash p-3">
              <dt className="text-xs font-bold uppercase tracking-wide text-brand-deep">How to verify</dt>
              <dd className="mt-0.5 leading-relaxed text-ink">{active.monitoring}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
