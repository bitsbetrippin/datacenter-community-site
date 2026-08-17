/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
import factsData from './facts.json'
import concernsData from './concerns.json'
import faqData from './faq.json'
import caseStudiesData from './case-studies.json'
import rumorFactData from './rumorfact.json'
import paretoData from './pareto.json'
import explainersData from './explainers.json'
import noiseLevelsData from './noiselevels.json'
import type {
  FactRecord,
  ConcernCategory,
  FaqEntry,
  CaseStudy,
  RumorFactBlock,
  ParetoData,
  ExplainerContent,
  NoiseRefLevel,
} from './types'

export const facts = factsData as FactRecord[]
export const concerns = concernsData as ConcernCategory[]
export const faqs = faqData as FaqEntry[]
export const caseStudies = caseStudiesData as CaseStudy[]
export const rumorFactBlocks = rumorFactData as RumorFactBlock[]
export const pareto = paretoData as ParetoData
export const explainers = explainersData as Record<string, ExplainerContent>
export const noiseLevels = noiseLevelsData as NoiseRefLevel[]

export function rumorFactsForConcern(concernId: string): RumorFactBlock[] {
  return rumorFactBlocks.filter((b) => b.concernId === concernId)
}

// R3 content
import twinData from './twin.json'
import bigPictureData from './bigpicture.json'

export interface TwinComponent {
  id: string
  name: string
  icon: string
  x: number
  y: number
  w: number
  h: number
  whatItIs: string
  whyItExists: string
  communityImpact: string
  mitigation: string
  monitoring: string
}

export interface BigPicture {
  comparison: {
    rows: {
      use: string
      jobs: string
      water: string
      power: string
      truckTraffic: string
      taxRevenue: string
      notes: string
    }[]
    sources: { title: string; url: string }[]
    defensibilityNote: string
  }
  receives: { item: string; detail: string }[]
  accepts: { item: string; detail: string }[]
  scorecard: { id: string; label: string; defaultWeight: number }[]
  futureTech: { tech: string; status: string; summary: string; sourceUrl: string }[]
}

export const twin = twinData as TwinComponent[]
export const bigPicture = bigPictureData as BigPicture

// R4 content
import playbookData from './playbook.json'

export interface Strategy {
  id: string
  name: string
  concernAddressed: string
  objective: string
  audience: string
  what: string
  why: string
  how: string
  when: string
  evidence: string
  cost: string
  difficulty: string
  impact: string
  example: string
  kpi: string
  tier: 'quick-win' | 'pre-entitlement' | 'construction' | 'long-term'
}

export interface TimelineStage {
  stage: string
  timing: string
  developer: string
  municipality: string
  utility: string
  residents: string
}

export const playbook = playbookData as { strategies: Strategy[]; timeline: TimelineStage[] }

export function factById(id: string): FactRecord | undefined {
  return facts.find((f) => f.id === id)
}

export function factsForConcern(concernId: string): FactRecord[] {
  return facts.filter((f) => f.concernTags.includes(concernId))
}

export function concernById(id: string): ConcernCategory | undefined {
  return concerns.find((c) => c.id === id)
}

export const tierLabels: Record<FactRecord['tier'], string> = {
  government: 'Government / Regulatory',
  academic: 'Academic / Peer-reviewed',
  independent: 'Independent Research',
  industry: 'Industry (company-reported)',
  community: 'Local / Community',
}
