/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { Link, useParams } from 'react-router-dom'
import { concernById, explainers, factsForConcern, faqs, rumorFactsForConcern } from '../content'
import { FactCard } from '../components/FactCard'
import { LevelTabs } from '../components/LevelTabs'
import { RumorFact } from '../components/RumorFact'
import { PowerPathDiagram } from '../components/PowerPathDiagram'
import { NoiseLadder } from '../components/NoiseLadder'
import { WaterSimulator } from '../components/tools/WaterSimulator'
import { NoiseCalculator } from '../components/tools/NoiseCalculator'
import { EconomicCalculator } from '../components/tools/EconomicCalculator'
import { JobsRoleMatrix } from '../components/JobsRoleMatrix'

export function ConcernPage() {
  const { id } = useParams<{ id: string }>()
  const concern = id ? concernById(id) : undefined

  if (!concern) {
    return (
      <div className="py-16 text-center">
        <p className="text-lg font-semibold text-ink">That topic doesn't exist.</p>
        <Link to="/" className="mt-2 inline-block text-brand hover:text-brand-deep">
          ← Back to all concerns
        </Link>
      </div>
    )
  }

  const relatedFacts = factsForConcern(concern.id)
  const relatedFaqs = faqs.filter((q) => q.concernTags.includes(concern.id))
  const blocks = rumorFactsForConcern(concern.id)
  const explainer = explainers[concern.id]

  return (
    <article className="mx-auto max-w-3xl space-y-8">
      <header>
        <Link to="/" className="text-sm text-brand hover:text-brand-deep">
          ← All concerns
        </Link>
        <h1 className="mt-2 text-2xl font-bold text-ink sm:text-3xl">
          <span aria-hidden="true">{concern.icon}</span> {concern.title}
        </h1>
        <p className="mt-1 text-base text-ink-secondary">"{concern.residentQuestion}"</p>
      </header>

      <LevelTabs
        content={{
          level1: (
            <p className="text-[15px] leading-relaxed text-ink">{concern.shortAnswer}</p>
          ),
          level2: (
            <div className="space-y-6">
              {concern.status === 'coming-soon' && (
                <p className="rounded-lg bg-brand-wash p-4 text-sm text-brand-deep">
                  The full explainer for this topic arrives with research wave{' '}
                  {concern.researchWave}. What you see now is verified seed content; we
                  publish nothing we can't source.
                </p>
              )}

              {concern.id === 'power' && <PowerPathDiagram />}
              {concern.id === 'noise' && <NoiseLadder />}
              {concern.id === 'water' && <WaterSimulator />}
              {concern.id === 'noise' && <NoiseCalculator />}
              {concern.id === 'taxes' && <EconomicCalculator />}
              {concern.id === 'jobs' && <JobsRoleMatrix />}

              {explainer && (
                <section>
                  <h2 className="text-lg font-bold text-ink">{explainer.title}</h2>
                  <div className="mt-3 space-y-4">
                    {explainer.paragraphs.map((p, i) => (
                      <p key={i} className="text-[15px] leading-relaxed text-ink-secondary">
                        {p}
                      </p>
                    ))}
                  </div>
                </section>
              )}

              {blocks.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-ink">
                    The questions people actually ask
                  </h2>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Tap a question for the honest answer, what determines it, and how to
                    verify it yourself.
                  </p>
                  <div className="mt-3 space-y-3">
                    {blocks.map((b) => (
                      <RumorFact key={b.id} block={b} />
                    ))}
                  </div>
                </section>
              )}

              {blocks.length === 0 &&
                relatedFaqs.map((q) => (
                  <div
                    key={q.id}
                    className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5"
                  >
                    <h3 className="font-semibold text-ink">{q.question}</h3>
                    <p className="mt-1 text-sm font-medium text-brand-deep">{q.answer20w}</p>
                    {q.answer100w && (
                      <p className="mt-2 text-sm leading-relaxed text-ink-secondary">
                        {q.answer100w}
                      </p>
                    )}
                  </div>
                ))}
            </div>
          ),
          level3: (
            <div className="space-y-4">
              {relatedFacts.length > 0 ? (
                relatedFacts.map((f) => <FactCard key={f.id} fact={f} />)
              ) : (
                <p className="text-sm text-ink-secondary">
                  Source records for this topic land with research wave{' '}
                  {concern.researchWave}. Browse everything collected so far in the{' '}
                  <Link to="/sources" className="text-brand hover:text-brand-deep">
                    Source Library
                  </Link>
                  .
                </p>
              )}
            </div>
          ),
        }}
      />
    </article>
  )
}
