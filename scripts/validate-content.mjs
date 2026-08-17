#!/usr/bin/env node
/**
 * Content integrity gate (release plan §4, verification gate 1).
 * Fails the build if any fact record is missing required fields,
 * if any FAQ/case-study references a nonexistent fact, or if a
 * fact lacks a real URL. Run: node scripts/validate-content.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const load = (p) => JSON.parse(readFileSync(join(root, 'src/content', p), 'utf8'))

const facts = load('facts.json')
const concerns = load('concerns.json')
const faqs = load('faq.json')
const caseStudies = load('case-studies.json')
const rumorFacts = load('rumorfact.json')
const pareto = load('pareto.json')

const errors = []
const factIds = new Set()
const concernIds = new Set(concerns.map((c) => c.id))
const REQUIRED = ['id', 'claim', 'sourceOrg', 'sourceTitle', 'pubDate', 'tier', 'url', 'geography', 'confidence', 'concernTags']
const TIERS = ['government', 'academic', 'independent', 'industry', 'community']

for (const f of facts) {
  for (const field of REQUIRED) {
    if (f[field] === undefined || f[field] === '') errors.push(`fact ${f.id ?? '?'}: missing ${field}`)
  }
  if (factIds.has(f.id)) errors.push(`fact ${f.id}: duplicate id`)
  factIds.add(f.id)
  if (f.tier && !TIERS.includes(f.tier)) errors.push(`fact ${f.id}: invalid tier "${f.tier}"`)
  if (f.url && !/^https:\/\//.test(f.url)) errors.push(`fact ${f.id}: url must be https`)
  if (f.pubDate && !/^\d{4}-\d{2}-\d{2}$/.test(f.pubDate)) errors.push(`fact ${f.id}: pubDate must be YYYY-MM-DD`)
  for (const tag of f.concernTags ?? []) {
    if (!concernIds.has(tag) && tag !== 'trust') errors.push(`fact ${f.id}: unknown concern tag "${tag}"`)
  }
  if (f.tier === 'industry' && f.companyReported !== true) {
    errors.push(`fact ${f.id}: tier "industry" requires companyReported: true`)
  }
}

for (const q of faqs) {
  for (const fid of q.factIds ?? []) {
    if (!factIds.has(fid)) errors.push(`faq ${q.id}: references unknown fact "${fid}"`)
  }
  if ((q.answer20w ?? '').split(/\s+/).length > 28) {
    errors.push(`faq ${q.id}: answer20w exceeds ~20 words`)
  }
}

for (const cs of caseStudies) {
  for (const fid of cs.factIds ?? []) {
    if (!factIds.has(fid)) errors.push(`case study ${cs.id}: references unknown fact "${fid}"`)
  }
}

for (const b of rumorFacts) {
  if (!concernIds.has(b.concernId)) errors.push(`rumorfact ${b.id}: unknown concernId "${b.concernId}"`)
  for (const fid of b.factIds ?? []) {
    if (!factIds.has(fid)) errors.push(`rumorfact ${b.id}: references unknown fact "${fid}"`)
  }
  for (const field of ['question', 'shortAnswer', 'whyConcerned', 'whatDetermines', 'verify']) {
    if (!b[field]) errors.push(`rumorfact ${b.id}: missing ${field}`)
  }
}

for (const e of [...pareto.quantified, ...pareto.qualitative]) {
  if (!factIds.has(e.factId)) errors.push(`pareto "${e.concern}": references unknown fact "${e.factId}"`)
}
if (!pareto.methodology) errors.push('pareto: missing methodology statement (required — brief §7)')

if (errors.length) {
  console.error(`✗ Content validation failed (${errors.length} problem${errors.length > 1 ? 's' : ''}):`)
  for (const e of errors) console.error('  - ' + e)
  process.exit(1)
}
console.log(`✓ Content valid: ${facts.length} facts, ${concerns.length} concerns, ${faqs.length} FAQs, ${caseStudies.length} case studies, ${rumorFacts.length} rumor-fact blocks, ${pareto.quantified.length + pareto.qualitative.length} pareto entries.`)
