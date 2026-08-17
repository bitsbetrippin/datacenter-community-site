/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
export function About() {
  return (
    <article className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-ink sm:text-3xl">How this site works</h1>

      <p className="leading-relaxed text-ink">
        This site exists to give residents, officials, and developers the same verified
        data when a data center is proposed nearby. It is built as an evidence library,
        not an advocacy campaign, which means it includes findings that are inconvenient
        for developers alongside findings that are inconvenient for opponents.
      </p>

      <section className="rounded-xl border border-[color:var(--color-hairline)] bg-surface p-5">
        <h2 className="font-semibold text-ink">The integrity rules every page follows</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-ink-secondary">
          <li>No unattributed statistics: every number links to its original source.</li>
          <li>
            Industry claims are labeled <em>company-reported</em>; they are not presented
            as independent findings.
          </li>
          <li>Modeled projections are labeled as projections, never as measurements.</li>
          <li>
            When credible studies disagree (electricity rates, property values), we show
            the disagreement and explain what drives it.
          </li>
          <li>
            Legitimate negative impacts (noise failures, subsidy costs, water disclosure
            gaps) are covered, not minimized.
          </li>
          <li>
            The honest answer to many questions is <em>"it depends on how the facility is
            designed"</em>, so our tools let you change the design and watch the answer
            change.
          </li>
        </ul>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">Three levels of depth, always</h2>
        <p className="mt-2 leading-relaxed text-ink-secondary">
          Every topic offers a 30-second plain-language answer, a deeper explainer with
          comparisons and context, and the raw source data: studies, permits,
          calculations, and assumptions. You choose how deep to go.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-ink">What's coming</h2>
        <p className="mt-2 leading-relaxed text-ink-secondary">
          This is the foundation release. Ahead: full explainers for each concern, an
          interactive water simulator, a community economic impact calculator, a noise
          comparison tool, a "what if?" facility design explorer, a digital facility tour,
          case studies from communities that approved, fought, and rejected projects, and
          a 100+ question FAQ, all built from sourced research as each wave completes.
        </p>
      </section>
    </article>
  )
}
