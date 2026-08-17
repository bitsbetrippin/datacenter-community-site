/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'

/**
 * "Where Does The Water Go?" simulator (brief §11).
 * Parameters from Wave 2 research: cooling-tower WUE 1-9 L/kWh by climate
 * (arXiv 2304.03271), grid water intensity ~3.1 L/kWh, EPA household 300 gal/day.
 * All outputs are labeled modeled estimates.
 */

const COOLING = {
  evaporative: { label: 'Evaporative cooling towers', pue: 1.25, note: 'Most water onsite, least energy' },
  hybrid: { label: 'Hybrid (evaporative + dry)', pue: 1.3, note: 'Middle ground' },
  air: { label: 'Air-cooled (dry)', pue: 1.4, note: 'Near-zero onsite, ~10-15% more energy' },
  closedloop: { label: 'Closed-loop liquid (direct-to-chip)', pue: 1.2, note: 'Filled once, like a radiator' },
} as const

const CLIMATE = {
  cool: { label: 'Cool / humid (e.g., Oregon, Great Lakes)', evapWUE: 1.0 },
  moderate: { label: 'Moderate (e.g., Virginia, Ohio)', evapWUE: 2.2 },
  hotdry: { label: 'Hot / dry (e.g., Arizona, West Texas)', evapWUE: 4.5 },
} as const

const GRID_L_PER_KWH = 3.1
const GAL_PER_L = 1 / 3.785
const EPA_HOME_GAL_DAY = 300

type CoolingKey = keyof typeof COOLING
type ClimateKey = keyof typeof CLIMATE

export function WaterSimulator() {
  const [mw, setMw] = useState(100)
  const [cooling, setCooling] = useState<CoolingKey>('evaporative')
  const [climate, setClimate] = useState<ClimateKey>('moderate')
  const [load, setLoad] = useState(80)

  const itKwhDay = mw * 1000 * 24 * (load / 100)
  const evapBase = CLIMATE[climate].evapWUE
  const onsiteWUE =
    cooling === 'evaporative' ? evapBase : cooling === 'hybrid' ? evapBase * 0.45 : cooling === 'air' ? 0.03 : 0.01
  const onsiteGalDay = itKwhDay * onsiteWUE * GAL_PER_L
  const facilityKwhDay = itKwhDay * COOLING[cooling].pue
  const indirectGalDay = facilityKwhDay * GRID_L_PER_KWH * GAL_PER_L
  const homesEquiv = Math.round(onsiteGalDay / EPA_HOME_GAL_DAY)

  const fmt = (n: number) =>
    n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`

  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <h3 className="text-base font-bold text-ink">Where does the water go? (simulator)</h3>
      <p className="mt-1 text-xs text-ink-muted">
        Change the design and watch the answer change; that's the point. Modeled estimates,
        not site measurements.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">Facility size: {mw} MW</span>
          <input
            type="range" min={25} max={500} step={25} value={mw}
            onChange={(e) => setMw(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Operating load: {load}%</span>
          <input
            type="range" min={40} max={100} step={5} value={load}
            onChange={(e) => setLoad(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Cooling design</span>
          <select
            value={cooling}
            onChange={(e) => setCooling(e.target.value as CoolingKey)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-hairline)] bg-surface p-2 text-ink"
          >
            {Object.entries(COOLING).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
          <span className="mt-0.5 block text-xs text-ink-muted">{COOLING[cooling].note}</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Climate</span>
          <select
            value={climate}
            onChange={(e) => setClimate(e.target.value as ClimateKey)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-hairline)] bg-surface p-2 text-ink"
          >
            {Object.entries(CLIMATE).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-medium text-brand-deep">Onsite water use</p>
          <p className="text-xl font-bold text-brand-deep">{fmt(onsiteGalDay)} gal/day</p>
          <p className="text-xs text-ink-secondary">
            ≈ {homesEquiv.toLocaleString()} average homes (EPA 300 gal/day)
          </p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Indirect (at power plants)</p>
          <p className="text-xl font-bold text-ink">{fmt(indirectGalDay)} gal/day</p>
          <p className="text-xs text-ink-secondary">U.S. grid avg ~3.1 L/kWh consumed</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Where it goes</p>
          <p className="text-sm text-ink">
            {cooling === 'evaporative' || cooling === 'hybrid'
              ? '~80% evaporates (leaves the watershed); ~20% returns as blowdown'
              : 'Minimal onsite use; the footprint shifts to the power plant'}
          </p>
        </div>
      </div>

      <details className="mt-4 rounded-lg bg-[color:var(--color-hairline)]/50 p-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink">Methodology & sources</summary>
        <p className="mt-2">
          Onsite use = IT energy × water-use effectiveness (WUE). Evaporative WUE by climate
          (~1 L/kWh cool to ~4.5 typical hot-dry, peaking near 9 in extreme heat) from UC
          Riverside/UT Arlington research (arXiv 2304.03271); air-cooled ≈0.03 and closed-loop
          ≈0.01 L/kWh ongoing. Indirect use = facility energy (IT × PUE assumption shown per
          design) × ~3.1 L/kWh U.S. average generation water intensity, which varies with your
          regional grid mix. Household benchmark: EPA WaterSense 300+ gal/day/family. Real
          projects vary; demand the site-specific water balance in the zoning application.
        </p>
      </details>
    </div>
  )
}
