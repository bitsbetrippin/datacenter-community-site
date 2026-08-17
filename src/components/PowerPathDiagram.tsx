/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
/**
 * Animated power-path diagram: Generation → Transmission → Substation → Data center → Servers.
 * Pure SVG + CSS animation; annotations show who pays and typical timelines
 * (sourced in the Power explainer facts: timeline-mismatch, aep-ohio-tariff).
 */
const stages = [
  { icon: '🏭', label: 'Power plant', note: 'Regional grid mix, shared with everyone', x: 60 },
  { icon: '🗼', label: 'Transmission', note: 'Upgrades take 7-10 years; shared "network" costs', x: 240 },
  { icon: '⚡', label: 'Substation', note: 'Dedicated bays paid by the data center', x: 420 },
  { icon: '🏢', label: 'Data center', note: 'Built in 18-24 months', x: 600 },
  { icon: '🖥️', label: 'Servers', note: 'Steady 24/7 load', x: 780 },
]

export function PowerPathDiagram() {
  return (
    <figure className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <figcaption className="mb-1 text-sm font-semibold text-ink">
        Where the electricity actually comes from
      </figcaption>
      <p className="mb-3 text-xs text-ink-muted">
        The timing mismatch (facility in ~2 years, transmission in 7-10) is the real
        source of grid stress.
      </p>
      <div className="overflow-x-auto">
        <svg viewBox="0 0 840 150" className="min-w-[640px]" role="img" aria-label="Diagram: power plant to transmission to substation to data center to servers">
          <style>{`
            .flowline { stroke-dasharray: 8 6; animation: flow 1.2s linear infinite; }
            @keyframes flow { to { stroke-dashoffset: -14; } }
            @media (prefers-reduced-motion: reduce) { .flowline { animation: none; } }
          `}</style>
          {stages.slice(0, -1).map((s, i) => (
            <line
              key={i}
              className="flowline"
              x1={s.x + 28}
              y1={46}
              x2={stages[i + 1].x - 28}
              y2={46}
              stroke="var(--color-brand)"
              strokeWidth={2}
            />
          ))}
          {stages.map((s) => (
            <g key={s.label}>
              <circle cx={s.x} cy={46} r={26} fill="var(--color-brand-wash)" />
              <text x={s.x} y={54} textAnchor="middle" fontSize="22">{s.icon}</text>
              <text x={s.x} y={92} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-ink)">
                {s.label}
              </text>
              {s.note.split('; ').map((line, j) => (
                <text key={j} x={s.x} y={108 + j * 13} textAnchor="middle" fontSize="10" fill="var(--color-ink-muted)">
                  {line}
                </text>
              ))}
            </g>
          ))}
        </svg>
      </div>
    </figure>
  )
}
