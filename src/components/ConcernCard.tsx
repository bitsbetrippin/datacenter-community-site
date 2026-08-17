/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { Link } from 'react-router-dom'
import type { ConcernCategory } from '../content/types'

export function ConcernCard({ concern }: { concern: ConcernCategory }) {
  return (
    <Link
      to={`/concerns/${concern.id}`}
      className="group flex flex-col rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5 transition-shadow hover:shadow-md focus-visible:shadow-md"
    >
      <div className="mb-2 flex items-center justify-between">
        <span aria-hidden="true" className="text-2xl">{concern.icon}</span>
        {concern.status === 'coming-soon' && (
          <span className="rounded-full bg-[color:var(--color-hairline)] px-2 py-0.5 text-xs font-medium text-ink-secondary">
            In research
          </span>
        )}
      </div>
      <h3 className="text-base font-semibold text-ink group-hover:text-brand-deep">
        {concern.title}
      </h3>
      <p className="mt-1 text-sm text-ink-secondary">{concern.residentQuestion}</p>
    </Link>
  )
}
