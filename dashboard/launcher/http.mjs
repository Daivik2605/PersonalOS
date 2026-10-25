// The launcher's HTTP surface (SPEC §4). No framework.
import http from 'node:http'
import { ALLOWED_ORIGIN, checkRequest, corsHeaders } from './guard.mjs'
import { LauncherError } from './manager.mjs'

export function createLauncherServer(manager, { allowedOrigin = ALLOWED_ORIGIN } = {}) {
  const server = http.createServer(async (req, res) => {
    const port = server.address()?.port
    const send = (status, body) => {
      res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', ...corsHeaders(req.headers, allowedOrigin) })
      res.end(JSON.stringify(body))
    }
    try {
      const refused = checkRequest(req, { port, allowedOrigin })
      if (refused) return send(refused.status, { error: refused.error })
      if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req.headers, allowedOrigin)); return res.end() }

      const { pathname } = new URL(req.url ?? '/', 'http://launcher')
      const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
      const [route, key] = parts
      const get = req.method === 'GET'

      if (get && route === 'status' && parts.length === 1) return send(200, { apps: await manager.status() })
      if (get && route === 'logs' && parts.length === 2) return send(200, manager.logs(key))
      if (!get && route === 'start' && parts.length === 2) return send(200, await manager.start(key))
      if (!get && route === 'stop' && parts.length === 2) return send(200, await manager.stop(key))
      if (!get && route === 'start-all' && parts.length === 1) return send(200, await manager.startAll())
      if (!get && route === 'stop-all' && parts.length === 1) return send(200, await manager.stopAll())
      return send(404, { error: 'not-found' })
    } catch (e) {
      if (e instanceof LauncherError) return send(e.status, { error: e.code, message: e.message })
      console.error('[launcher] unexpected error', e)
      return send(500, { error: 'internal' })
    }
  })
  return server
}
