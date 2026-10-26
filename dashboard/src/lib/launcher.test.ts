import { describe, expect, it, vi } from 'vitest'
import { createLauncherClient, launcherMode } from './launcher'

describe('launcherMode', () => {
  it('is disabled when the URL is unset or blank (hosted build)', () => {
    expect(launcherMode(undefined, 'https://os.example.com')).toEqual({ kind: 'disabled' })
    expect(launcherMode('  ', 'http://localhost:5170')).toEqual({ kind: 'disabled' })
  })
  it('asks for localhost:5170 on any other origin', () => {
    for (const origin of ['http://127.0.0.1:5170', 'http://192.168.1.5:5170', 'https://os.example.com']) {
      expect(launcherMode('http://127.0.0.1:5171', origin)).toEqual({ kind: 'wrong-origin', origin })
    }
  })
  it('is enabled on http://localhost:5170 and trims a trailing slash', () => {
    expect(launcherMode('http://127.0.0.1:5171/', 'http://localhost:5170')).toEqual({ kind: 'enabled', url: 'http://127.0.0.1:5171' })
  })
})

describe('launcher client', () => {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })

  it('sends X-PersonalOS: 1 on every POST and on no GET', async () => {
    const fetchFn = vi.fn(async () => json(200, {}))
    const c = createLauncherClient('http://127.0.0.1:5171', fetchFn as unknown as typeof fetch)
    await c.start('taskflow'); await c.stop('taskflow'); await c.startAll(); await c.stopAll()
    await c.status(); await c.logs('taskflow'); await c.backup()
    const calls = fetchFn.mock.calls as unknown as [string, RequestInit][]
    expect(calls.map(([url, init]) => [init.method, url.replace('http://127.0.0.1:5171', '')])).toEqual([
      ['POST', '/start/taskflow'], ['POST', '/stop/taskflow'], ['POST', '/start-all'], ['POST', '/stop-all'],
      ['GET', '/status'], ['GET', '/logs/taskflow'], ['GET', '/backup'],
    ])
    for (const [, init] of calls) {
      if (init.method === 'POST') expect(init.headers).toEqual({ 'X-PersonalOS': '1' })
      else expect(init.headers).toBeUndefined()
    }
  })

  it('reports an unreachable launcher as offline', async () => {
    const c = createLauncherClient('http://127.0.0.1:5171', (async () => { throw new TypeError('Failed to fetch') }) as typeof fetch)
    expect(await c.status()).toEqual({ ok: false, offline: true })
  })

  it('passes the launcher error code and message through', async () => {
    const c = createLauncherClient('http://127.0.0.1:5171', (async () => json(409, { error: 'port-in-use', message: 'Port 5175 is already in use' })) as typeof fetch)
    expect(await c.start('taskflow')).toEqual({ ok: false, offline: false, code: 'port-in-use', message: 'Port 5175 is already in use' })
  })

  it('encodes the app key in the path', async () => {
    const fetchFn = vi.fn(async () => json(404, { error: 'unknown-app' }))
    await createLauncherClient('http://x', fetchFn as unknown as typeof fetch).start('../a b')
    expect((fetchFn.mock.calls[0] as unknown as [string])[0]).toBe('http://x/start/..%2Fa%20b')
  })
})
