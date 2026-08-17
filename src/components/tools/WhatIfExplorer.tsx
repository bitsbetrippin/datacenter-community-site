/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'

/**
 * "What If?" design explorer (brief §21). Change the design, watch every
 * community-facing number change. Parameters from Waves 1-6 research:
 * acres/MW (APA), construction months (industry synthesis), WUE by climate
 * (arXiv 2304.03271), ops staffing 0.15-0.35 FTE/MW and construction
 * 0.7-2.0 workers/MW (USC/Hamm), homes-equivalent (EIA), noise physics (FHWA),
 * setback examples (Fairfax 200/300 ft, Henrico 500 ft).
 */

const COOLING = {
  evaporative: { label: 'Evaporative towers', wue: 2.2, pue: 1.25, noiseDba50: 70 },
  air: { label: 'Air-cooled (dry)', wue: 0.03, pue: 1.4, noiseDba50: 68 },
  closedloop: { label: 'Closed-loop liquid', wue: 0.01, pue: 1.2, noiseDba50: 62 },
} as const

const POWER_ARCH = {
  grid: {
    label: 'Grid only',
    note: 'Standard path: utility interconnection, dedicated substation paid by the facility. Grid-upgrade cost allocation depends on your state’s tariff rules.',
  },
  gridDr: {
    label: 'Grid + demand response',
    note: 'Facility agrees to curtail or shift computing during grid peaks (Google has contracted 1 GW of this with five utilities). Reduces peak strain; still needs full interconnection.',
  },
  onsiteGas: {
    label: 'Grid + onsite gas turbines',
    note: 'Fastest to power but highest local air impact and permitting risk. Unpermitted turbines in Memphis became a major enforcement and trust failure. Expect air-permit scrutiny.',
  },
  nuclearPpa: {
    label: 'Nuclear power purchase deal',
    note: 'Contracts with existing reactors are real (Three Mile Island restart for Microsoft targets mid-2027; 1,920 MW Talen-AWS deal). Power still flows through the shared grid. No SMR powers any data center today.',
  },
} as const

type CoolingKey = keyof typeof COOLING
type ArchKey = keyof typeof POWER_ARCH

export function WhatIfExplorer() {
  const [mw, setMw] = useState(250)
  const [cooling, setCooling] = useState<CoolingKey>('evaporative')
  const [arch, setArch] = useState<ArchKey>('grid')
  const [setback, setSetback] = useState(500)

  const acresLow = Math.round(mw * 0.5)
  const acresHigh = Math.round(mw * 1.5)
  const homesLow = Math.round((mw * 1000 * 24 * 365 * 0.8) / 10791 / 1000)
  const homesHigh = Math.round((mw * 1000 * 24 * 365) / 10791 / 1000)
  const waterGalDay = Math.round((mw * 1000 * 24 * 0.8 * COOLING[cooling].wue) / 3.785)
  const opsJobsLow = Math.round(mw * 0.15)
  const opsJobsHigh = Math.round(mw * 0.35)
  const conJobsLow = Math.round(mw * 0.7)
  const conJobsHigh = Math.round(mw * 2.0)
  const buildings = Math.max(1, Math.round(mw / 60))
  const buildYears = mw <= 100 ? '1.5-2.5 years' : mw <= 400 ? '2-4 years (phased)' : '3-6+ years (phased campus)'
  const noise = Math.max(25, Math.round(COOLING[cooling].noiseDba50 - 20 * Math.log10(setback / 50)))

  const fmt = (n: number) => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}k` : `${n}`)

  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <h3 className="text-base font-bold text-ink">What if? Design your own facility</h3>
      <p className="mt-1 text-xs text-ink-muted">
        The point of this tool: the answer to most questions is "it depends on the design."
        Change the design and watch six answers change at once. Modeled from sourced
        benchmarks, not predictions for any real project.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">Campus size: {mw} MW</span>
          <input type="range" min={50} max={1000} step={50} value={mw}
            onChange={(e) => setMw(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Setback to nearest home: {setback.toLocaleString()} ft</span>
          <input type="range" min={100} max={2000} step={100} value={setback}
            onChange={(e) => setSetback(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
          <span className="text-xs text-ink-muted">Adopted standards: Fairfax 200 ft (buildings) / 300 ft (generators); Henrico 500 ft</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Cooling design</span>
          <select value={cooling} onChange={(e) => setCooling(e.target.value as CoolingKey)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-hairline)] bg-surface p-2 text-ink">
            {Object.entries(COOLING).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Power architecture</span>
          <select value={arch} onChange={(e) => setArch(e.target.value as ArchKey)}
            className="mt-1 w-full rounded-md border border-[color:var(--color-hairline)] bg-surface p-2 text-ink">
            {Object.entries(POWER_ARCH).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Land</p>
          <p className="text-lg font-bold text-ink">{acresLow}-{acresHigh} acres</p>
          <p className="text-xs text-ink-secondary">~{buildings} building{buildings > 1 ? 's' : ''} (APA 0.5-1.5 acres/MW)</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Electricity</p>
          <p className="text-lg font-bold text-ink">≈ {homesLow}k-{homesHigh}k homes</p>
          <p className="text-xs text-ink-secondary">EIA average-home equivalent at 80-100% load</p>
        </div>
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-medium text-brand-deep">Onsite water</p>
          <p className="text-lg font-bold text-brand-deep">{fmt(waterGalDay)} gal/day</p>
          <p className="text-xs text-ink-secondary">moderate climate, 80% load; switch cooling to see the design effect</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Jobs</p>
          <p className="text-lg font-bold text-ink">{opsJobsLow}-{opsJobsHigh} permanent</p>
          <p className="text-xs text-ink-secondary">{conJobsLow}-{conJobsHigh} construction at peak (USC/Hamm per-MW benchmarks)</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Construction timeline</p>
          <p className="text-lg font-bold text-ink">{buildYears}</p>
          <p className="text-xs text-ink-secondary">12-36 months per building; big campuses phase for years</p>
        </div>
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-medium text-brand-deep">Cooling noise at that setback</p>
          <p className="text-lg font-bold text-brand-deep">~{noise} dBA</p>
          <p className="text-xs text-ink-secondary">ideal-conditions physics; enforceable limits beat models</p>
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-[color:var(--color-hairline)] p-3">
        <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Power architecture implications</p>
        <p className="mt-1 text-sm text-ink-secondary">{POWER_ARCH[arch].note}</p>
      </div>
    </div>
  )
}
