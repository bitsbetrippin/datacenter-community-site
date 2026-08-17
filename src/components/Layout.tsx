/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Home', end: true },
  { to: '/faq', label: 'FAQ', end: false },
  { to: '/tools', label: 'Tools', end: false },
  { to: '/tour', label: 'Tour', end: false },
  { to: '/case-studies', label: 'Cases', end: false },
  { to: '/trade-offs', label: 'Trade-offs', end: false },
  { to: '/playbook', label: 'Playbook', end: false },
  { to: '/sources', label: 'Sources', end: false },
  { to: '/about', label: 'About', end: false },
]

export function Layout() {
  const [dark, setDark] = useState(false)
  const [fontScale, setFontScale] = useState(() => {
    try {
      const saved = Number(localStorage.getItem('bbt-fontscale'))
      return saved >= 0 && saved <= 3 ? saved : 0
    } catch {
      return 0
    }
  })

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])

  useEffect(() => {
    document.documentElement.dataset.fontscale = String(fontScale)
    try {
      localStorage.setItem('bbt-fontscale', String(fontScale))
    } catch {
      /* storage unavailable; scale still applies for this visit */
    }
  }, [fontScale])

  return (
    <div className="min-h-screen">
      <header className="border-b border-[color:var(--color-hairline)] bg-surface">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <Link to="/" className="text-sm font-bold tracking-tight text-ink sm:text-base">
            Data Centers,{' '}
            <span className="text-brand">Answered With Data</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
            {nav.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-wash text-brand-deep'
                      : 'text-ink-secondary hover:text-ink'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
            <button
              onClick={() => setFontScale((s) => (s + 1) % 4)}
              aria-label={`Text size level ${fontScale} of 3. Click for ${fontScale === 3 ? 'smallest' : 'larger'} text.`}
              title={`Text size: level ${fontScale} of 3`}
              className="ml-1 flex items-center gap-1 rounded-md border border-[color:var(--color-hairline)] px-2 py-1.5 text-ink-secondary hover:text-ink"
            >
              <span className="text-sm font-bold">A</span>
              <span className="flex items-end gap-0.5" aria-hidden="true">
                {[0, 1, 2, 3].map((lvl) => (
                  <span
                    key={lvl}
                    className={`w-1 rounded-sm ${lvl <= fontScale ? 'bg-brand' : 'bg-[color:var(--color-hairline)]'}`}
                    style={{ height: `${6 + lvl * 3}px` }}
                  />
                ))}
              </span>
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              className="ml-1 rounded-md px-2 py-1.5 text-sm text-ink-secondary hover:text-ink"
            >
              {dark ? '☀️' : '🌙'}
            </button>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>

      <footer className="border-t border-[color:var(--color-hairline)] bg-surface">
        <div className="mx-auto max-w-5xl px-4 py-6 text-sm text-ink-secondary">
          <p className="font-medium text-ink">Our rule: no unattributed statistics.</p>
          <p className="mt-1">
            Every number on this site links to its original source, labels whether it is
            measured or modeled, and says whether it comes from independent research or the
            industry itself. Where evidence is mixed, we show the disagreement.
          </p>
          <p className="mt-3 text-xs text-ink-muted">
            v1.0 · A BitsBeTrippin project, built with Claude support · 106 sourced fact
            records · 109-question FAQ · 20 acceptance strategies · Sources re-verified
            quarterly; this field moves fast, so check publication dates on any figure
            you quote.
          </p>
        </div>
      </footer>
    </div>
  )
}
