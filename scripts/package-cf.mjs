#!/usr/bin/env node
/**
 * Cloudflare packaging: nest the Vite build under /datacenters so asset paths
 * match the bitsbetrippin.io/datacenters route. Root redirect and SPA fallback
 * are handled by cloudflare/worker.js (a _redirects file is not used; the
 * Workers assets validator rejects nested SPA rewrite rules).
 *
 * Run via: npm run build:cf   (deploy: npx wrangler deploy)
 */
import { cpSync, mkdirSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'dist-cf')

rmSync(out, { recursive: true, force: true })
mkdirSync(join(out, 'datacenters'), { recursive: true })
cpSync(join(root, 'dist'), join(out, 'datacenters'), { recursive: true })

console.log('dist-cf ready: /datacenters app (fallback handled by cloudflare/worker.js)')
