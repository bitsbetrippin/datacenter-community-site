/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'
import { noiseLevels } from '../../content'

/**
 * "Will I hear it?" distance calculator (brief §12, R2 scope).
 * Physics: point-source spreading, -6 dB per doubling of distance
 * (FHWA Construction Noise Handbook); barrier insertion loss ~7 dBA
 * (5-10 design range). Deliberately labeled ideal-conditions modeling.
 */

const SOURCES = {
  cooling: { label: 'Unmitigated cooling yard', dBA: 70, ref: 50, note: 'up to ~70 dBA near equipment (documented upper bound)' },
  quiet: { label: 'Quiet-by-design cooling (enclosed, low-speed fans)', dBA: 55, ref: 50, note: 'achievable with modern acoustic design' },
  generator: { label: 'Generator load test (monthly, ~30-60 min)', dBA: 98, ref: 25, note: '90-105 dBA @ 25 ft typical range' },
} as const

type SourceKey = keyof typeof SOURCES

export function NoiseCalculator() {
  const [source, setSource] = useState<SourceKey>('cooling')
  const [distance, setDistance] = useState(400)
  const [barrier, setBarrier] = useState(false)

  const s = SOURCES[source]
  const raw = s.dBA - 20 * Math.log10(distance / s.ref) - (barrier ? 7 : 0)
  const predicted = Math.max(25, Math.round(raw))

  const everyday = noiseLevels
    .filter((l) => l.category === 'everyday')
    .reduce((best, l) => (Math.abs(l.dBA - predicted) < Math.abs(best.dBA - predicted) ? l : best))

  const vsNight = predicted - 50

  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <h3 className="text-base font-bold text-ink">Will I hear it at my house? (calculator)</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Ideal-conditions physics model; real results vary with wind, terrain, and
        low-frequency content (which fades more slowly than this math suggests).
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">Noise source</span>
          <select
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKey)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-hairline)] bg-surface p-2 text-ink"
          >
            {Object.entries(SOURCES).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-ink-muted">{s.note}</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">
            Distance from equipment: {distance >= 5280 ? '1 mile' : `${distance.toLocaleString()} ft`}
          </span>
          <input
            type="range" min={50} max={5280} step={50} value={distance}
            onChange={(e) => setDistance(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]"
          />
          <label className="mt-2 flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={barrier} onChange={(e) => setBarrier(e.target.checked)}
              className="accent-[color:var(--color-brand)]" />
            Acoustic barrier / berm (−7 dBA, must block line of sight)
          </label>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-medium text-brand-deep">Predicted level at your location</p>
          <p className="text-2xl font-bold text-brand-deep">~{predicted} dBA</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Sounds about like</p>
          <p className="text-sm font-semibold text-ink">{everyday.label} ({everyday.dBA} dBA)</p>
          <p className="text-xs text-ink-secondary">CDC everyday-sound reference</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">vs. typical 50 dBA night limit</p>
          <p className={`text-sm font-semibold ${vsNight > 0 ? 'text-[color:var(--color-status-critical)]' : 'text-[color:var(--color-status-good)]'}`}>
            {vsNight > 0 ? `${vsNight} dB above` : `${Math.abs(vsNight)} dB below`}
          </p>
          <p className="text-xs text-ink-secondary">
            {source === 'generator' ? 'Brief scheduled tests; ask for daytime-only conditions' : 'Continuous 24/7 source'}
          </p>
        </div>
      </div>

      <details className="mt-4 rounded-lg bg-[color:var(--color-hairline)]/50 p-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink">Methodology & limits</summary>
        <p className="mt-2">
          Point-source spreading: level falls 6 dB per doubling of distance from the
          reference measurement (FHWA Construction Noise Handbook), floored at a 25 dBA
          rural-quiet background. Barrier credit uses the 5-10 dBA engineering design range.
          This model understates low-frequency hum (which penetrates walls and carries on
          still nights) and ignores wind and terrain. That is why enforceable property-line
          limits with dBA <em>and</em> dBC measurement beat any model, including this one.
        </p>
      </details>
    </div>
  )
}
