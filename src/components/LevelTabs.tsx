/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useId, useState, type ReactNode } from 'react'

/**
 * Three-level information model (brief §26):
 * Level 1: 30-second answer. Level 2: learn more. Level 3: source data.
 * Accessible tabs with keyboard arrow support.
 */
export interface LevelContent {
  level1: ReactNode
  level2: ReactNode
  level3: ReactNode
}

const LABELS = ['30-second answer', 'Learn more', 'Source data'] as const

export function LevelTabs({ content }: { content: LevelContent }) {
  const [active, setActive] = useState(0)
  const baseId = useId()
  const panels = [content.level1, content.level2, content.level3]

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowRight') setActive((a) => (a + 1) % 3)
    if (e.key === 'ArrowLeft') setActive((a) => (a + 2) % 3)
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Level of detail"
        className="flex gap-1 rounded-lg bg-[color:var(--color-hairline)] p-1"
        onKeyDown={onKeyDown}
      >
        {LABELS.map((label, i) => (
          <button
            key={label}
            role="tab"
            id={`${baseId}-tab-${i}`}
            aria-selected={active === i}
            aria-controls={`${baseId}-panel-${i}`}
            tabIndex={active === i ? 0 : -1}
            onClick={() => setActive(i)}
            className={`flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors ${
              active === i
                ? 'bg-surface text-ink shadow-sm'
                : 'text-ink-secondary hover:text-ink'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div
          key={i}
          role="tabpanel"
          id={`${baseId}-panel-${i}`}
          aria-labelledby={`${baseId}-tab-${i}`}
          hidden={active !== i}
          className="pt-4"
        >
          {panel}
        </div>
      ))}
    </div>
  )
}
