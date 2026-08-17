/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import jobsRolesData from '../content/jobsroles.json'
import { factById } from '../content'
import { CitationPopover } from './CitationPopover'

interface RoleRow {
  role: string
  range: string
  median: string
  source: string
  sourceUrl: string
  onSite: string
  sourceType: 'government' | 'aggregator'
}

const data = jobsRolesData as {
  intro: string
  roles: RoleRow[]
  onSiteNote: string
  staffing: { title: string; body: string; factIds: string[] }
}

export function JobsRoleMatrix() {
  return (
    <div className="space-y-5">
      <figure className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
        <figcaption className="text-sm font-semibold text-ink">
          The full role and salary spectrum
        </figcaption>
        <p className="mt-1 text-xs text-ink-secondary">{data.intro}</p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-[color:var(--color-hairline)] text-left">
                <th className="py-2 pr-3 font-semibold text-ink">Role</th>
                <th className="py-2 pr-3 font-semibold text-ink">Typical range</th>
                <th className="py-2 pr-3 font-semibold text-ink">Median / avg</th>
                <th className="py-2 pr-3 font-semibold text-ink">Where</th>
                <th className="py-2 font-semibold text-ink">Source</th>
              </tr>
            </thead>
            <tbody className="align-top text-ink-secondary">
              {data.roles.map((r) => (
                <tr key={r.role} className="border-b border-[color:var(--color-hairline)] last:border-0">
                  <td className="py-2 pr-3 font-medium text-ink">{r.role}</td>
                  <td className="py-2 pr-3 text-xs">{r.range}</td>
                  <td className="py-2 pr-3 tabular-nums text-xs font-semibold text-brand-deep">{r.median}</td>
                  <td className="py-2 pr-3 text-xs">{r.onSite}</td>
                  <td className="py-2 text-xs">
                    <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer"
                      className="text-brand underline decoration-dotted underline-offset-4 hover:text-brand-deep">
                      {r.source}
                    </a>
                    {r.sourceType === 'aggregator' && (
                      <span className="ml-1 rounded-full bg-[#fdf3e0] px-1.5 py-0.5 text-[10px] font-medium text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]">
                        self-reported
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-ink-muted">{data.onSiteNote}</p>
      </figure>

      <div className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
        <h3 className="text-sm font-semibold text-ink">{data.staffing.title}</h3>
        <p className="mt-2 text-sm leading-relaxed text-ink-secondary">{data.staffing.body}</p>
        <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
          {data.staffing.factIds
            .map((id) => factById(id))
            .filter((f): f is NonNullable<typeof f> => Boolean(f))
            .map((f) => (
              <CitationPopover key={f.id} fact={f} />
            ))}
        </div>
      </div>
    </div>
  )
}
