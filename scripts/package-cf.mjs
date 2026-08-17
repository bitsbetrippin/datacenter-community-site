#!/usr/bin/env node
/**
 * Cloudflare Pages packaging: nest the Vite build under /datacenters and add
 * the SPA fallback + root redirect, so the Pages project serves the app at
 * <project>.pages.dev/datacenters/ with the same paths the production Worker
 * route (bitsbetrippin.io/datacenters/*) proxies to.
 *
 * Run via: npm run build:cf   (Cloudflare Pages build output directory: dist-cf)
 */
import { cpSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-cf')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'datacenters'), { recursive: true })
cpSync(join(root, 'dist'), join(out, 'datacenters'), { recursive: true })

writeFileSync(
  join(out, '_redirects'),
  [
    '# Root of the Pages project points into the subsite',
    '/ /datacenters/ 302',
    '/datacenters /datacenters/ 301',
    '# SPA fallback: client-side routes resolve to the app shell',
    '/datacenters/* /datacenters/index.html 200',
    '',
  ].join('\n'),
)

console.log('dist-cf ready: /datacenters app + _redirects (SPA fallback)')
