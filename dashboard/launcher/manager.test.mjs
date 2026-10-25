// @vitest-environment node
import { spawn } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createManager, LauncherError } from './manager.mjs'
import { isPortUp } from './ports.mjs'
import { closeServer, fixtureApp, freePort, groupGone, hasIPv6, listen, makeFixtureBase, pidAlive } from './testkit.mjs'

const cleanups = []
afterEach(async () => { for (const c of cleanups.splice(0).reverse()) await c() })

async function setup({ host = '127.0.0.1', env = {}, termGraceMs = 3000 } = {}) {
  const base = makeFixtureBase({ host })
  const port = await freePort(host)
  process.env.FX_PORT = String(port)
  for (const [k, v] of Object.entries(env)) process.env[k] = v
  const spy = vi.fn(spawn)
  const m = createManager({ apps: [fixtureApp('fx', port)], baseDir: base, logDir: join(base, 'logs'), spawnFn: spy, termGraceMs, logCheckMs: 100 })
  cleanups.push(async () => { await m.stopAll().catch(() => {}); delete process.env.FX_PORT; for (const k of Object.keys(env)) delete process.env[k] })
  return { m, port, base, spy }
}

const serverPidFromLog = (m) => Number(/SERVER_PID=(\d+)/.exec(m.logs('fx').lines.join('\n'))?.[1])
const upSoon = async (port) => { for (let i = 0; i < 60; i++) { if (await isPortUp(port)) return true; await new Promise((r) => setTimeout(r, 100)) } return false }

describe('start and stop', () => {
  it('stops the whole process group: the port is free afterwards and no process in the group survives', async () => {
    const { m, port } = await setup()
    const { pgid } = await m.start('fx')
    expect(await upSoon(port)).toBe(true)
    const serverPid = serverPidFromLog(m)
    expect(serverPid).toBeGreaterThan(0)
    expect(serverPid).not.toBe(pgid) // the server is a child of the wrapper, like vite under npm

    const [st] = await m.status()
    expect(st).toMatchObject({ up: true, startedByLauncher: true, state: 'running', canStop: true })

    const r = await m.stop('fx')
    expect(r).toMatchObject({ stopped: true, portFree: true })
    expect(await isPortUp(port)).toBe(false)
    expect(groupGone(pgid)).toBe(true)
    expect(pidAlive(serverPid)).toBe(false)
    expect((await m.status())[0]).toMatchObject({ up: false, state: 'stopped', canStop: false })
  })

  it('killing only the wrapper PID would have left the port taken (why we signal the group)', async () => {
    const { m, port } = await setup()
    const { pgid } = await m.start('fx')
    await upSoon(port)
    const serverPid = serverPidFromLog(m)
    process.kill(pgid, 'SIGKILL') // the "npm" PID only
    await new Promise((r) => setTimeout(r, 300))
    expect(await isPortUp(port)).toBe(true) // the child still holds it
    expect(m.ownedKeys()).toEqual(['fx']) // group still alive, so we still own it and can stop it properly
    await m.stop('fx')
    expect(await isPortUp(port)).toBe(false)
    expect(pidAlive(serverPid)).toBe(false)
  })

  it('stops an app that listens on ::1 only, and the port check sees it up and then free', async () => {
    if (!(await hasIPv6())) return
    const { m, port } = await setup({ host: '::1' })
    await m.start('fx')
    expect(await upSoon(port)).toBe(true)
    expect((await m.status())[0].up).toBe(true)
    await m.stop('fx')
    expect(await isPortUp(port)).toBe(false)
    expect((await m.status())[0].up).toBe(false)
  })

  it('escalates to SIGKILL when the app ignores SIGTERM', async () => {
    const { m, port } = await setup({ env: { FX_IGNORE_TERM: '1' }, termGraceMs: 400 })
    await m.start('fx')
    await upSoon(port)
    const r = await m.stop('fx')
    expect(r.forced).toBe(true)
    expect(await isPortUp(port)).toBe(false)
  })

  it('refuses to start twice', async () => {
    const { m, port } = await setup()
    await m.start('fx')
    await upSoon(port)
    await expect(m.start('fx')).rejects.toMatchObject({ status: 409, code: 'already-started' })
  })
})

describe('only what the launcher started', () => {
  it('shows an app started elsewhere as external and refuses to stop it; the process keeps running', async () => {
    const { m, port, spy } = await setup()
    const outsider = await listen(port, '127.0.0.1')
    cleanups.push(() => closeServer(outsider))
    expect((await m.status())[0]).toMatchObject({ up: true, startedByLauncher: false, state: 'external', canStop: false })
    await expect(m.stop('fx')).rejects.toMatchObject({ status: 409, code: 'not-started-by-launcher' })
    await expect(m.start('fx')).rejects.toMatchObject({ status: 409, code: 'port-in-use' })
    expect(outsider.listening).toBe(true)
    expect(await isPortUp(port)).toBe(true)
    expect(spy).not.toHaveBeenCalled()
  })

  it('start-all skips apps whose port is up instead of failing, and says which', async () => {
    const { m, port } = await setup()
    const outsider = await listen(port, '127.0.0.1')
    cleanups.push(() => closeServer(outsider))
    const r = await m.startAll()
    expect(r).toEqual({ started: [], skipped: [{ key: 'fx', reason: 'port-in-use' }], failed: [] })
  })

  it('forgets a group that exited by itself, so it can never signal a recycled group id', async () => {
    const { m, port, base } = await setup()
    writeFileSync(join(base, 'fx', 'run.sh'), 'echo bye\n') // exits at once, no server
    await m.start('fx')
    for (let i = 0; i < 50 && m.ownedKeys().length; i++) { await new Promise((r) => setTimeout(r, 100)); await m.status() }
    expect(m.ownedKeys()).toEqual([])
    const kill = vi.spyOn(process, 'kill')
    await expect(m.stop('fx')).rejects.toMatchObject({ code: 'not-running' })
    expect(kill).not.toHaveBeenCalledWith(expect.any(Number), 'SIGTERM')
    kill.mockRestore()
    expect(await isPortUp(port)).toBe(false)
  })
})

describe('command allowlist', () => {
  it('rejects an unknown key without spawning anything', async () => {
    const { m, spy } = await setup()
    for (const key of ['nope', '../fx', '__proto__', 'constructor', 'fx; rm -rf /', '']) {
      await expect(m.start(key)).rejects.toBeInstanceOf(LauncherError)
      await expect(m.start(key)).rejects.toMatchObject({ status: 404 })
      await expect(m.stop(key)).rejects.toMatchObject({ status: 404 })
      expect(() => m.logs(key)).toThrow(LauncherError)
    }
    expect(spy).not.toHaveBeenCalled()
  })

  it('runs exactly the argv from apps.json, with the app folder as cwd, no shell', async () => {
    const { m, spy, base, port } = await setup()
    await m.start('fx')
    await upSoon(port)
    const [cmd, args, opts] = spy.mock.calls[0]
    expect(cmd).toBe('sh')
    expect(args).toEqual(['run.sh'])
    expect(opts).toMatchObject({ cwd: join(base, 'fx'), detached: true })
    expect(opts.shell).toBeUndefined()
  })
})

describe('logs', () => {
  it('truncates the log file each time the app is started', async () => {
    const { m, base, port } = await setup()
    await m.start('fx'); await upSoon(port); await m.stop('fx')
    const log = join(base, 'logs', 'fx.log')
    writeFileSync(log, 'old line\n'.repeat(1000))
    await m.start('fx'); await upSoon(port)
    expect(readFileSync(log, 'utf8')).not.toContain('old line')
    expect(m.logs('fx').lines.join('\n')).toContain('SERVER_PID=')
  })

  it('returns only the last 200 lines', async () => {
    const { m, base } = await setup()
    writeFileSync(join(base, 'logs', 'fx.log'), Array.from({ length: 500 }, (_, i) => `line ${i}`).join('\n') + '\n')
    const { lines } = m.logs('fx')
    expect(lines).toHaveLength(200)
    expect(lines.at(-1)).toBe('line 499')
  })

  it('caps a running app\'s log at about 1 MB', async () => {
    const { m, base, port } = await setup()
    await m.start('fx'); await upSoon(port)
    const log = join(base, 'logs', 'fx.log')
    writeFileSync(log, 'x'.repeat(1.2 * 1024 * 1024), { flag: 'a' })
    for (let i = 0; i < 30 && readFileSync(log).length > 1024 * 1024; i++) await new Promise((r) => setTimeout(r, 100))
    expect(readFileSync(log).length).toBeLessThan(1024)
    expect(existsSync(log)).toBe(true)
  })
})
