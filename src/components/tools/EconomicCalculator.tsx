/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useState } from 'react'

/**
 * Community Economic Impact Calculator (brief §13).
 * Defaults from Wave 4 research: capex $7-16.3M/MW (Dgtl Infra), Loudoun rates
 * ($0.805 real / $4.15 equipment per $100, year-1 equipment assessment at 50%),
 * JLARC ~50 jobs/building & 1,500 peak construction, ~$54k technician salary.
 * Every output is a labeled simplification; the methodology accordion is part of the tool.
 */
export function EconomicCalculator() {
  const [capexM, setCapexM] = useState(1000)
  const [equipShare, setEquipShare] = useState(55)
  const [realRate, setRealRate] = useState(0.805)
  const [equipRate, setEquipRate] = useState(4.15)
  const [abatePct, setAbatePct] = useState(0)
  const [jobs, setJobs] = useState(50)
  const [salary] = useState(54000)

  const realBase = capexM * (1 - equipShare / 100)
  const equipBase = capexM * (equipShare / 100)
  const realTaxY1 = realBase * (realRate / 100) * (1 - abatePct / 100)
  const equipTaxY1 = equipBase * 0.5 * (equipRate / 100)
  const totalY1 = realTaxY1 + equipTaxY1
  const payroll = (jobs * salary) / 1_000_000

  const fmtM = (m: number) =>
    m >= 1000 ? `$${(m / 1000).toFixed(2)}B` : m >= 1 ? `$${m.toFixed(1)}M` : `$${Math.round(m * 1000).toLocaleString()}k`

  return (
    <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
      <h3 className="text-base font-bold text-ink">
        What does a ${capexM >= 1000 ? `${(capexM / 1000).toFixed(1)} billion` : `${capexM} million`} data center
        actually mean locally? (calculator)
      </h3>
      <p className="mt-1 text-xs text-ink-muted">
        Modeled first-year estimates with deliberately visible assumptions. The details of
        the deal matter more than the headline investment number.
      </p>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-ink">Capital investment: {fmtM(capexM)}</span>
          <input type="range" min={100} max={10000} step={100} value={capexM}
            onChange={(e) => setCapexM(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
          <span className="text-xs text-ink-muted">Benchmark: ~$7-12M per MW of capacity</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Equipment share of investment: {equipShare}%</span>
          <input type="range" min={40} max={75} step={5} value={equipShare}
            onChange={(e) => setEquipShare(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
          <span className="text-xs text-ink-muted">Weakest parameter: servers vs building split varies widely</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Real property tax rate: ${realRate.toFixed(3)}/$100</span>
          <input type="range" min={0.3} max={1.5} step={0.005} value={realRate}
            onChange={(e) => setRealRate(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Equipment tax rate: ${equipRate.toFixed(2)}/$100</span>
          <input type="range" min={0} max={4.2} step={0.05} value={equipRate}
            onChange={(e) => setEquipRate(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
          <span className="text-xs text-ink-muted">Set to 0: many states don't tax equipment. This is the biggest lever.</span>
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Real-property abatement: {abatePct}%</span>
          <input type="range" min={0} max={100} step={5} value={abatePct}
            onChange={(e) => setAbatePct(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-ink">Permanent jobs: {jobs} · avg ${Math.round(salary / 1000)}k</span>
          <input type="range" min={20} max={500} step={10} value={jobs}
            onChange={(e) => setJobs(Number(e.target.value))}
            className="mt-1 w-full accent-[color:var(--color-brand)]" />
          <span className="text-xs text-ink-muted">Benchmark: ~50 per building (JLARC); 100-200 net county jobs (Brookings)</span>
        </label>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-brand-wash p-3">
          <p className="text-xs font-medium text-brand-deep">Year-1 local tax revenue (modeled)</p>
          <p className="text-xl font-bold text-brand-deep">{fmtM(totalY1)}</p>
          <p className="text-xs text-ink-secondary">
            {fmtM(equipTaxY1)} equipment + {fmtM(realTaxY1)} real property
          </p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Annual permanent payroll</p>
          <p className="text-xl font-bold text-ink">{fmtM(payroll)}</p>
          <p className="text-xs text-ink-secondary">{jobs} jobs × ${salary.toLocaleString()}</p>
        </div>
        <div className="rounded-lg bg-[color:var(--color-hairline)]/50 p-3">
          <p className="text-xs font-medium text-ink-secondary">Construction (temporary)</p>
          <p className="text-sm text-ink">
            Up to ~1,500 workers at peak per building for 12-18 months, the larger but
            temporary employment event
          </p>
        </div>
      </div>

      <details className="mt-4 rounded-lg bg-[color:var(--color-hairline)]/50 p-3 text-xs text-ink-secondary">
        <summary className="cursor-pointer font-medium text-ink">
          Methodology & honest caveats (read these)
        </summary>
        <ul className="mt-2 list-disc space-y-1.5 pl-4">
          <li>Equipment revenue is NOT an annuity: assessed at ~50% of cost in year one (Loudoun schedule), depreciating fast. It holds up only if servers are refreshed every ~3-7 years. Loudoun missed a forecast by $60M in 2021 when refreshes slowed.</li>
          <li>Many states have no equipment (business tangible personal property) tax. Set that slider to 0 and watch the answer change. This single rule explains most of the difference between Virginia-style windfalls and modest revenue elsewhere.</li>
          <li>State sales-tax exemptions (Virginia: $929M in FY23) are a state cost not shown here; they don't reduce local revenue but are part of the public cost of the deal.</li>
          <li>Service costs to the locality are genuinely low (few added residents or students), but fire capability, roads, and water infrastructure should be itemized, not ignored.</li>
          <li>"Jobs supported" multipliers are modeled ripple effects; this tool shows only direct payroll. Independent research (Brookings) finds smaller net effects than industry studies.</li>
          <li>Loudoun County is an outlier; do not read its rates and outcomes as typical. Defaults here are sourced benchmarks, not predictions for your county.</li>
        </ul>
      </details>
    </div>
  )
}
