// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import http from 'node:http'
import { checkRequest } from './guard.mjs'
import { createLauncherServer } from './http.mjs'

const ORIGIN = 'http://localhost:5170'

describe('checkRequest (unit)', () => {
  const ctx = { port: 5171 }
  const h = (over = {}) => ({ host: '127.0.0.1:5171', ...over })
  it('allows the dashboard origin with the custom header', () => {
    expect(checkRequest({ method: 'POST', headers: h({ origin: ORIGIN, 'x-personalos': '1' }) }, ctx)).toBeNull()
  })
  it('refuses a POST without the custom header', () => {
    expect(checkRequest({ method: 'POST', headers: h({ origin: ORIGIN }) }, ctx)?.error).toBe('missing-header')
    expect(checkRequest({ method: 'POST', headers: h() }, ctx)?.error).toBe('missing-header')
    expect(checkRequest({ method: 'POST', headers: h({ 'x-personalos': '0' }) }, ctx)?.error).toBe('missing-header')
  })
  it.each(['https://evil.example', 'null', 'http://127.0.0.1:5170', 'http://localhost:5171', 'http://localhost:5170.evil.example', 'https://localhost:5170'])(
    'refuses origin %s', (origin) => {
      expect(checkRequest({ method: 'POST', headers: h({ origin, 'x-personalos': '1' }) }, ctx)?.error).toBe('bad-origin')
      expect(checkRequest({ method: 'GET', headers: h({ origin }) }, ctx)?.error).toBe('bad-origin')
    })
  it('refuses a Host that is not loopback on our port (DNS rebinding)', () => {
    expect(checkRequest({ method: 'GET', headers: { host: 'evil.example:5171' } }, ctx)?.error).toBe('bad-host')
    expect(checkRequest({ method: 'GET', headers: { host: '127.0.0.1:9999' } }, ctx)?.error).toBe('bad-host')
    expect(checkRequest({ method: 'GET', headers: {} }, ctx)?.error).toBe('bad-host')
  })
  it('refuses other methods', () => {
    expect(checkRequest({ method: 'DELETE', headers: h() }, ctx)?.status).toBe(405)
  })
})

describe('launcher HTTP server (real sockets)', () => {
  function setup() {
    const manager = {
      status: vi.fn(async () => []), logs: vi.fn(() => ({ lines: [] })),
      start: vi.fn(async (key) => ({ key })), stop: vi.fn(async (key) => ({ key })),
      startAll: vi.fn(async () => ({})), stopAll: vi.fn(async () => ({})),
    }
    const server = createLauncherServer(manager)
    return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
      const port = server.address().port
      const call = (method, path, headers = {}) => new Promise((res, rej) => {
        const r = http.request({ host: '127.0.0.1', port, method, path, headers: { host: `127.0.0.1:${port}`, ...headers } }, (resp) => {
          let body = ''
          resp.on('data', (c) => (body += c))
          resp.on('end', () => res({ status: resp.statusCode, headers: resp.headers, body: body ? JSON.parse(body) : null }))
        })
        r.on('error', rej)
        r.end()
      })
      resolve({ manager, call, port, close: () => new Promise((r) => server.close(() => r())) })
    }))
  }
  const noSideEffects = (m) => ['start', 'stop', 'startAll', 'stopAll'].forEach((k) => expect(m[k]).not.toHaveBeenCalled())

  it('rejects a simple cross-site POST: nothing is started', async () => {
    const s = await setup()
    // What a hostile page can send without a preflight: a POST with a simple content type. It carries its own Origin.
    const r = await s.call('POST', '/start/taskflow', { origin: 'https://evil.example', 'content-type': 'text/plain' })
    expect(r.status).toBe(403)
    expect(r.headers['access-control-allow-origin']).toBeUndefined()
    // Even if the page could set the custom header, the Origin check still stops it.
    const r2 = await s.call('POST', '/start-all', { origin: 'https://evil.example', 'x-personalos': '1' })
    expect(r2.status).toBe(403)
    noSideEffects(s.manager)
    await s.close()
  })

  it('rejects the right origin without the X-PersonalOS header, and no origin without it', async () => {
    const s = await setup()
    expect((await s.call('POST', '/stop/taskflow', { origin: ORIGIN })).body.error).toBe('missing-header')
    expect((await s.call('POST', '/stop-all')).status).toBe(403)
    noSideEffects(s.manager)
    await s.close()
  })

  it('rejects lookalike origins even with the header', async () => {
    const s = await setup()
    for (const origin of ['http://127.0.0.1:5170', 'http://localhost:5171', 'null']) {
      expect((await s.call('POST', '/start/taskflow', { origin, 'x-personalos': '1' })).status).toBe(403)
    }
    noSideEffects(s.manager)
    await s.close()
  })

  it('rejects GETs from other origins and requests with a foreign Host', async () => {
    const s = await setup()
    expect((await s.call('GET', '/status', { origin: 'https://evil.example' })).status).toBe(403)
    expect((await s.call('GET', '/logs/taskflow', { host: 'rebind.evil.example:' + s.port })).status).toBe(403)
    expect(s.manager.status).not.toHaveBeenCalled()
    expect(s.manager.logs).not.toHaveBeenCalled()
    await s.close()
  })

  it('answers a preflight only for the dashboard origin', async () => {
    const s = await setup()
    const bad = await s.call('OPTIONS', '/start/taskflow', { origin: 'https://evil.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-personalos' })
    expect(bad.status).toBe(403)
    expect(bad.headers['access-control-allow-origin']).toBeUndefined()
    const good = await s.call('OPTIONS', '/start/taskflow', { origin: ORIGIN, 'access-control-request-method': 'POST', 'access-control-request-headers': 'x-personalos' })
    expect(good.status).toBe(204)
    expect(good.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect(good.headers['access-control-allow-headers']).toMatch(/X-PersonalOS/i)
    await s.close()
  })

  it('serves the dashboard origin with the header, and a no-Origin client (curl) with the header', async () => {
    const s = await setup()
    const ok = await s.call('POST', '/start/taskflow', { origin: ORIGIN, 'x-personalos': '1' })
    expect(ok.status).toBe(200)
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN)
    expect((await s.call('POST', '/stop/taskflow', { 'x-personalos': '1' })).status).toBe(200)
    expect((await s.call('GET', '/status', { origin: ORIGIN })).status).toBe(200)
    expect(s.manager.start).toHaveBeenCalledWith('taskflow')
    expect(s.manager.stop).toHaveBeenCalledWith('taskflow')
    await s.close()
  })

  it('returns 405 for other methods and 404 for unknown routes', async () => {
    const s = await setup()
    expect((await s.call('DELETE', '/status')).status).toBe(405)
    expect((await s.call('GET', '/nope')).status).toBe(404)
    await s.close()
  })
})
