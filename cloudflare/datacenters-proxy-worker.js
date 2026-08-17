/**
 * Cloudflare Worker: serves bitsbetrippin.io/datacenters/* from the
 * datacenter-community-site Pages project, keeping the subsite on the main
 * domain while both projects deploy independently.
 *
 * Setup (one time, ~5 minutes, in the Cloudflare dashboard):
 * 1. Workers & Pages > Create > Worker. Paste this file. Deploy.
 * 2. Worker > Settings > Variables: add PAGES_HOST with the value of the
 *    Pages project host, e.g. datacenter-community-site.pages.dev
 * 3. Worker > Settings > Domains & Routes > Add route:
 *      Route: bitsbetrippin.io/datacenters*
 *      Zone:  bitsbetrippin.io
 *    (Add a second route for www.bitsbetrippin.io/datacenters* if www is not
 *    redirected to the apex at the edge.)
 * 4. Done. The main site is untouched; every push to the subsite repo
 *    redeploys the Pages project and the route picks it up automatically.
 *
 * Notes:
 * - The Pages build (npm run build:cf, output dist-cf) already nests the app
 *   under /datacenters with its own SPA fallback, so paths pass through 1:1.
 * - Caching: Pages sets immutable cache headers on hashed assets; the Worker
 *   passes them through. No KV or Supabase involvement needed; the subsite is
 *   fully static.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    url.hostname = env.PAGES_HOST
    // Preserve path (/datacenters/...) and query; pass the original request
    // through so method, headers, and body are untouched.
    return fetch(new Request(url, request))
  },
}
