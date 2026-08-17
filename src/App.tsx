/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { ConcernPage } from './pages/ConcernPage'
import { Sources } from './pages/Sources'
import { About } from './pages/About'
import { Tools } from './pages/Tools'
import { Tour } from './pages/Tour'
import { CaseStudies } from './pages/CaseStudies'
import { TradeOffs } from './pages/TradeOffs'
import { Faq } from './pages/Faq'
import { Playbook } from './pages/Playbook'

/**
 * BrowserRouter with the /datacenters basename: the app lives at
 * bitsbetrippin.io/datacenters as a subsite. Clean URLs require the SPA
 * fallback in the deploy config (_redirects for Cloudflare Pages,
 * staticwebapp.config.json for the Azure fallback).
 */
export default function App() {
  return (
    <BrowserRouter basename="/datacenters">
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Home />} />
          <Route path="/concerns/:id" element={<ConcernPage />} />
          <Route path="/tools" element={<Tools />} />
          <Route path="/tour" element={<Tour />} />
          <Route path="/case-studies" element={<CaseStudies />} />
          <Route path="/trade-offs" element={<TradeOffs />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/playbook" element={<Playbook />} />
          <Route path="/sources" element={<Sources />} />
          <Route path="/about" element={<About />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
