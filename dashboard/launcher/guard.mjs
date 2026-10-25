// Browser safety for the launcher. CORS alone does not stop another website from sending a "simple" POST to
// 127.0.0.1:5171: the request still runs, only the response is hidden. So the server itself refuses:
//  - any Host other than 127.0.0.1:<port> / localhost:<port> (DNS rebinding),
//  - any request carrying an Origin other than the dashboard's (browsers always send Origin on cross-origin POSTs),
//  - any POST without the custom X-PersonalOS header, which is not CORS-safelisted, so a browser must preflight it,
//    and the preflight only succeeds for the allowed origin.
export const ALLOWED_ORIGIN = 'http://localhost:5170'
export const CUSTOM_HEADER = 'x-personalos'

/**
 * @returns {{ status: number, error: string } | null} a refusal, or null when the request may proceed
 */
export function checkRequest({ method, headers }, { port, allowedOrigin = ALLOWED_ORIGIN }) {
  const host = headers.host
  if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) return { status: 403, error: 'bad-host' }
  const origin = headers.origin
  if (origin !== undefined && origin !== allowedOrigin) return { status: 403, error: 'bad-origin' }
  if (method === 'OPTIONS') return null
  if (method === 'GET') return null
  if (method === 'POST') return headers[CUSTOM_HEADER] === '1' ? null : { status: 403, error: 'missing-header' }
  return { status: 405, error: 'method-not-allowed' }
}

export function corsHeaders(headers, allowedOrigin = ALLOWED_ORIGIN) {
  if (headers.origin !== allowedOrigin) return {}
  return {
    'access-control-allow-origin': allowedOrigin,
    'access-control-allow-methods': 'GET, POST, OPTIONS',
    'access-control-allow-headers': 'X-PersonalOS, Content-Type',
    'access-control-max-age': '600',
    vary: 'Origin',
  }
}
