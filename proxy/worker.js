/**
 * Cloudflare Worker — IPTV CORS Proxy
 * 
 * Do NOT use it for anything other than testing or personal use.
 * THIS IS NOT A PRODUCTION-READY PROXY! 
 * It lacks security features and may expose your IPTV server to abuse.
 * THIS IS AN EXAMPLE FILE! THIS IS NOT TESTED. 
 * Use at your own risk and only if you understand the code.
 *
 * Free deployment:
 *   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Paste this file into the online editor and click "Deploy"
 *   3. Copy the generated URL (e.g. https://iptv-proxy.YOUR_USER.workers.dev)
 *   4. In the IPTV app → Settings → CORS Proxy, paste:
 *        https://iptv-proxy.YOUR_USER.workers.dev/?url=
 *      and enable the "CORS Proxy" toggle
 *
 * How it works:
 *   - The worker receives ?url=<ENCODED_ORIGINAL_URL>
 *   - It fetches the resource server-side (Cloudflare → IPTV server)
 *   - It returns the response with CORS headers to the browser
 *   - The browser never touches HTTP directly → no Mixed Content errors
 *   - All HLS .ts segments also go through the proxy via xhrSetup
 */

const ALLOWED_ORIGINS = [
  'https://tronipm.github.io',
  // Add other authorized domains if needed
  // 'https://my-other-domain.com',
]

export default {
  /** @param {Request} request */
  async fetch(request) {
    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return corsResponse(new Response(null, { status: 204 }), request)
    }

    // ── Read the ?url= parameter ────────────────────────────────────────────
    const { searchParams } = new URL(request.url)
    const raw = searchParams.get('url')

    if (!raw) {
      return corsResponse(
        new Response('Missing "url" parameter. Use: ?url=<ENCODED_URL>', { status: 400 }),
        request,
      )
    }

    // ── Validate the target URL ─────────────────────────────────────────────
    let targetUrl
    try {
      targetUrl = new URL(decodeURIComponent(raw))
    } catch {
      return corsResponse(new Response('Invalid URL.', { status: 400 }), request)
    }

    if (targetUrl.protocol !== 'http:' && targetUrl.protocol !== 'https:') {
      return corsResponse(new Response('Protocol not allowed.', { status: 403 }), request)
    }

    // ── Fetch the upstream resource ─────────────────────────────────────────
    try {
      const upstream = await fetch(targetUrl.toString(), {
        method: request.method,
        headers: buildUpstreamHeaders(request, targetUrl),
        redirect: 'follow',
      })

      // Copy response headers, removing ones that conflict with the proxy
      const responseHeaders = new Headers(upstream.headers)
      responseHeaders.delete('content-encoding')
      responseHeaders.delete('transfer-encoding')

      const response = new Response(upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: responseHeaders,
      })

      return corsResponse(response, request)
    } catch (err) {
      return corsResponse(
        new Response(`Error fetching resource: ${err.message}`, { status: 502 }),
        request,
      )
    }
  },
}

/**
 * Adds the required CORS headers to the response.
 * @param {Response} response
 * @param {Request} request
 */
function corsResponse(response, request) {
  const origin = request.headers.get('Origin') ?? '*'
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : '*'

  const headers = new Headers(response.headers)
  headers.set('Access-Control-Allow-Origin', allowed)
  headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Range, Content-Type')
  headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range')

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  })
}

/**
 * Builds the headers for the upstream request.
 * @param {Request} request
 * @param {URL} targetUrl
 */
function buildUpstreamHeaders(request, targetUrl) {
  const headers = new Headers()
  // Forward Range header for seeking support in progressive streams
  const range = request.headers.get('Range')
  if (range) headers.set('Range', range)
  // Correct Host for the target server
  headers.set('Host', targetUrl.host)
  headers.set('User-Agent', 'Mozilla/5.0 (compatible; IPTV-Proxy/1.0)')
  return headers
}
