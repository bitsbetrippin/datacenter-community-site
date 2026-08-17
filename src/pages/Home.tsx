/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { Link } from 'react-router-dom'
import { concerns, facts } from '../content'
import { ConcernCard } from '../components/ConcernCard'
import { FactCard } from '../components/FactCard'
import { ParetoChart } from '../components/ParetoChart'

export function Home() {
  const featured = ['lbnl-2023-share', 'gallup-2026-oppose-71', 'jlarc-two-sided']
  const featuredFacts = facts.filter((f) => featured.includes(f.id))

  return (
    <div className="space-y-12">
      {/* Hero */}
      <section className="pt-4 text-center sm:pt-10">
        <h1 className="mx-auto max-w-3xl text-3xl font-bold tracking-tight text-ink sm:text-5xl">
          You have questions about data centers.
          <br />
          <span className="text-brand">Let's answer them with data.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-base text-ink-secondary sm:text-lg">
          Not a sales pitch. An evidence library. Every claim on this site links to its
          original source: government studies, independent research, and yes, industry
          numbers clearly labeled as industry numbers.
        </p>
      </section>

      {/* Pareto */}
      <section aria-labelledby="pareto-heading">
        <h2 id="pareto-heading" className="sr-only">
          What drives opposition
        </h2>
        <ParetoChart />
      </section>

      {/* Concern hub */}
      <section aria-labelledby="concerns-heading">
        <h2 id="concerns-heading" className="text-xl font-bold text-ink">
          What are people most concerned about?
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Pick a topic. Each opens an evidence-based explainer with a 30-second answer, a
          deeper dive, and the raw sources.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {concerns.map((c) => (
            <ConcernCard key={c.id} concern={c} />
          ))}
        </div>
      </section>

      {/* Featured facts */}
      <section aria-labelledby="facts-heading">
        <h2 id="facts-heading" className="text-xl font-bold text-ink">
          Three facts to start with
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          One about scale, one about public opinion, one about tradeoffs, because all
          three are true at the same time.
        </p>
        <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
          {featuredFacts.map((f) => (
            <FactCard key={f.id} fact={f} />
          ))}
        </div>
      </section>

      {/* Persona pathways */}
      <section aria-labelledby="personas-heading">
        <h2 id="personas-heading" className="text-xl font-bold text-ink">
          Start where you are
        </h2>
        <p className="mt-1 text-sm text-ink-secondary">
          Different neighbors need different answers. Pick the description closest to you.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: '🏠', who: 'I live near the proposed site', want: 'Noise, property value, and what I can demand in the permit', to: '/concerns/noise' },
            { icon: '💵', who: "I'm worried about my utility bill", want: 'When rates rise, when they fall, and who pays for the grid', to: '/concerns/power' },
            { icon: '🚜', who: 'I farm or own land nearby', want: 'Water, wells, land conversion, and what happens at end of life', to: '/concerns/water' },
            { icon: '🏫', who: 'I care about school funding', want: 'What the tax deal actually delivers, and the abatement fine print', to: '/concerns/taxes' },
            { icon: '🌱', who: "I'm an environmental advocate", want: 'Emissions, renewable claims worth trusting, water and habitat', to: '/concerns/environment' },
            { icon: '🏛️', who: "I'm an official or commissioner", want: 'Ordinance benchmarks, enforceable conditions, and the playbook', to: '/playbook' },
            { icon: '👷', who: 'I want the jobs story straight', want: 'Construction boom vs permanent headcount, wages, local hiring', to: '/concerns/jobs' },
            { icon: '🔍', who: "I'm skeptical of everything here", want: 'Every source, every caveat, every industry label', to: '/sources' },
            { icon: '❓', who: 'I just have questions', want: `${'109'} plain-language answers, searchable`, to: '/faq' },
          ].map((p) => (
            <Link key={p.who} to={p.to}
              className="group rounded-xl border border-[color:var(--color-hairline)] bg-surface p-4 transition-shadow hover:shadow-md">
              <p className="text-sm font-semibold text-ink">
                <span aria-hidden="true" className="mr-1.5">{p.icon}</span>
                {p.who}
              </p>
              <p className="mt-1 text-xs text-ink-secondary">{p.want}</p>
              <p className="mt-2 text-xs font-medium text-brand group-hover:text-brand-deep">Start here →</p>
            </Link>
          ))}
        </div>
      </section>

      {/* AI transparency notice */}
      <section aria-label="AI transparency notice">
        <div className="rounded-xl border-2 border-[color:var(--color-brand)] bg-brand-wash p-5">
          <p className="text-sm font-bold uppercase tracking-wide text-brand-deep">
            Transparency notice
          </p>
          <p className="mt-2 text-sm leading-relaxed text-ink">
            <span className="font-semibold">Claude</span>, an AI assistant made by
            Anthropic, was used in support of the structure, deep research, and
            functionality of this website and project. Claude helped organize the research
            plan, gather and cross-check sources, and build the site's interactive
            features, all under the same rule that governs every page here: no
            unattributed statistics, and every claim links to its original, independently
            verifiable source. A site about transparency should practice it.
          </p>
        </div>
      </section>
    </div>
  )
}
