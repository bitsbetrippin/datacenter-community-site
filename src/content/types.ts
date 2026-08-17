/*
 * Data Centers, Answered With Data (v1.0)
 * Original design: BitsBeTrippin (bitsbetrippin.io)
 * Development and site construction support: Claude (Anthropic)
 * Requirements independently validated against the original project brief;
 * see docs/REQUIREMENTS.md for the ask-to-implementation mapping.
 */
/**
 * Content-layer types.
 * Mirrors the fact-record schema in project doc 01 (research plan) §1,
 * which itself implements the project brief §5 source documentation format.
 * Every statistic rendered anywhere on the site MUST come from a FactRecord.
 */

export type SourceTier =
  | 'government'      // Tier 1: government & regulatory
  | 'academic'        // Tier 2: university & peer-reviewed
  | 'independent'     // Tier 3: independent research orgs
  | 'industry'        // Tier 4: company-reported
  | 'community'       // Tier 5: local reporting & community sources

export type Confidence = 'high' | 'medium' | 'low'

export interface FactRecord {
  id: string
  /** Concise statement of the claim, plain language. */
  claim: string
  /** Quantitative value as display string, if applicable (e.g. "4.4% of U.S. electricity"). */
  value?: string
  sourceOrg: string
  sourceTitle: string
  /** ISO date of publication. */
  pubDate: string
  tier: SourceTier
  url: string
  /** Where the research applies (e.g. "United States", "Virginia"). */
  geography: string
  /** Modeled vs measured, sample notes, etc. */
  methodologyNote?: string
  confidence: Confidence
  /** Limitations and qualifications, REQUIRED to render alongside the claim when present. */
  caveats?: string
  /** Concern category ids this fact supports. */
  concernTags: string[]
  /** True when the number comes from the company itself (brief §4 Tier 4 rule). */
  companyReported?: boolean
  /** True for modeled/projected values rather than measured ones (brief §38). */
  modeled?: boolean
}

export interface ConcernCategory {
  id: string
  /** Emoji icon per brief §18. */
  icon: string
  title: string
  /** One-sentence framing of what residents actually ask. */
  residentQuestion: string
  /** Level 1: the 30-second answer (plain language, honest). */
  shortAnswer: string
  /** Status of the full explainer content. */
  status: 'available' | 'coming-soon'
  /** Which research wave produces the full content. */
  researchWave: number
}

export interface FaqEntry {
  id: string
  question: string
  concernTags: string[]
  answer20w: string
  answer100w?: string
  technicalAnswer?: string
  factIds: string[]
}

/** Rumor → Fact → Proof block (brief §17), the core explainer unit. */
export interface RumorFactBlock {
  id: string
  concernId: string
  question: string
  shortAnswer: string
  whyConcerned: string
  whatDetermines: string
  verify: string
  factIds: string[]
}

export interface ParetoData {
  title: string
  methodology: string
  phaseNote: string
  quantified: { concern: string; sharePct: number; factId: string }[]
  qualitative: { rank: number; concern: string; evidence: string; factId: string }[]
}

export interface ExplainerContent {
  title: string
  paragraphs: string[]
}

export interface NoiseRefLevel {
  label: string
  dBA: number
  category: 'everyday' | 'datacenter' | 'limit'
  sourceUrl: string
}

export interface CaseStudy {
  id: string
  location: string
  state: string
  outcome: 'approved' | 'approved-after-opposition' | 'rejected' | 'moratorium' | 'modified'
  summary: string
  whyCommunityReacted: string
  factIds: string[]
  sources: { title: string; url: string }[]
}
