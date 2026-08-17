/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import type { FactRecord } from '../content/types'
import { tierLabels } from '../content'

const tierStyles: Record<FactRecord['tier'], string> = {
  government: 'bg-brand-wash text-brand-deep',
  academic: 'bg-brand-wash text-brand-deep',
  independent: 'bg-[color:var(--color-hairline)] text-ink-secondary',
  industry: 'bg-[#fdf3e0] text-[#8a5a00] dark:bg-[#3a2d10] dark:text-[#eda100]',
  community: 'bg-[color:var(--color-hairline)] text-ink-secondary',
}

export function SourceBadge({ tier }: { tier: FactRecord['tier'] }) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tierStyles[tier]}`}
    >
      {tierLabels[tier]}
    </span>
  )
}
