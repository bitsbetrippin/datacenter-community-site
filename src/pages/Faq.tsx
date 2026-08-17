/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useMemo, useState } from 'react'
import { concerns, factById, faqs } from '../content'
import { CitationPopover } from '../components/CitationPopover'

export function Faq() {
  const [query, setQuery] = useState('')
  const [tag, setTag] = useState<string>('all')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return faqs.filter((f) => {
      if (tag !== 'all' && !f.concernTags.includes(tag)) return false
      if (!q) return true
      return (
        f.question.toLowerCase().includes(q) ||
        f.answer20w.toLowerCase().includes(q) ||
        (f.answer100w ?? '').toLowerCase().includes(q)
      )
    })
  }, [query, tag])

  const tags = [
    { id: 'all', label: 'All' },
    ...concerns.map((c) => ({ id: c.id, label: `${c.icon} ${c.title}` })),
    { id: 'trust', label: '🤝 Process & Trust' },
  ]

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">
          {faqs.length} questions, answered honestly
        </h1>
        <p className="mt-1 max-w-2xl text-ink-secondary">
          Real questions the way residents actually ask them. Every answer follows the
          site rule: numbers trace to sources, mixed evidence is presented as mixed, and
          "it depends" answers say what it depends on.
        </p>
      </header>

      <div className="space-y-3">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search questions (well, bill, hum, taxes, trucks...)"
          aria-label="Search questions"
          className="w-full max-w-xl rounded-lg border border-[color:var(--color-hairline)] bg-surface p-3 text-ink placeholder:text-ink-muted"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by topic">
          {tags.map((t) => (
            <button key={t.id} onClick={() => setTag(t.id)} aria-pressed={tag === t.id}
              className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                tag === t.id
                  ? 'bg-brand text-white'
                  : 'bg-[color:var(--color-hairline)] text-ink-secondary hover:text-ink'
              }`}>
              {t.label}
            </button>
          ))}
        </div>
        <p className="text-sm text-ink-muted">{shown.length} of {faqs.length} questions</p>
      </div>

      <div className="space-y-3">
        {shown.map((f) => {
          const entryFacts = f.factIds.map((id) => factById(id)).filter((x): x is NonNullable<typeof x> => Boolean(x))
          return (
            <details key={f.id} className="group rounded-xl border border-[color:var(--color-hairline)] bg-surface">
              <summary className="cursor-pointer list-none p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-sm font-semibold text-ink sm:text-base">"{f.question}"</h2>
                  <span className="mt-0.5 shrink-0 text-brand transition-transform group-open:rotate-90">▸</span>
                </div>
                <p className="mt-1 text-sm font-medium text-brand-deep">{f.answer20w}</p>
              </summary>
              <div className="border-t border-[color:var(--color-hairline)] p-4 pt-3">
                {f.answer100w && (
                  <p className="text-sm leading-relaxed text-ink-secondary">{f.answer100w}</p>
                )}
                {entryFacts.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1">
                    {entryFacts.map((fact) => (
                      <CitationPopover key={fact.id} fact={fact} />
                    ))}
                  </div>
                )}
              </div>
            </details>
          )
        })}
        {shown.length === 0 && (
          <p className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-6 text-sm text-ink-secondary">
            No matches. Try a shorter search term, or browse a topic above. If your
            question isn't here, the concern explainers and Source Library go deeper.
          </p>
        )}
      </div>
    </div>
  )
}
