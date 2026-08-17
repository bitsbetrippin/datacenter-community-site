/**
 * Data Centers, Answered With Data (BitsBeTrippin)
 * Runs only when a request does not match a static asset file:
 * root redirect plus SPA fallback for deep links like /datacenters/faq.
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (url.pathname === '/' || url.pathname === '/datacenters') {
      return Response.redirect(url.origin + '/datacenters/', 301)
    }
    if (url.pathname.startsWith('/datacenters')) {
      return env.ASSETS.fetch(new Request(url.origin + '/datacenters/index.html', request))
    }
    return new Response('Not found', { status: 404 })
  },
}
