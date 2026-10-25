// Starts and stops apps. Safety rules (dashboard/CLAUDE.md):
//  - only commands listed in apps.json are ever spawned (no shell, argv array);
//  - each app runs detached as the leader of its own process group, and Stop signals that whole group, because
//    `npm run dev` starts Vite as a child and killing npm's PID alone leaves Vite holding the port;
//  - only process groups this launcher spawned are ever signalled: never by name, pattern or port owner.
import { spawn } from 'node:child_process'
import { closeSync, existsSync, ftruncateSync, mkdirSync, openSync, readFileSync, statSync, writeFileSync, writeSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { isPortUp, waitUntil } from './ports.mjs'

export const LOG_CAP_BYTES = 1024 * 1024
const LOG_LINES = 200

export class LauncherError extends Error {
  constructor(status, code, message) {
    super(message)
    this.status = status
    this.code = code
  }
}

function groupAlive(pgid) {
  try { process.kill(-pgid, 0); return true } catch (e) { return e.code === 'EPERM' }
}

/**
 * @param {object} o
 * @param {Array} o.apps parsed apps.json
 * @param {string} o.baseDir folder that app `folder`s are relative to (PersonalOS root)
 * @param {string} o.logDir where per-app log files go
 * @param {Function} [o.spawnFn] test hook, defaults to child_process.spawn
 * @param {number} [o.termGraceMs] wait after SIGTERM before SIGKILL
 * @param {number} [o.logCheckMs] how often a running app's log is checked against the 1 MB cap
 */
export function createManager({ apps, baseDir, logDir, spawnFn = spawn, termGraceMs = 5000, logCheckMs = 30_000 }) {
  const byKey = new Map(apps.map((a) => [a.key, a]))
  /** key -> { pgid, startedAt, logFd, error } for groups WE spawned, and only those. */
  const owned = new Map()
  const lastError = new Map()
  mkdirSync(logDir, { recursive: true })

  const logPath = (key) => join(logDir, `${key}.log`)

  function appOrThrow(key) {
    const app = byKey.get(key)
    if (!app) throw new LauncherError(404, 'unknown-app', `No app "${key}" in apps.json`)
    return app
  }

  function release(key) {
    const o = owned.get(key)
    if (!o) return
    clearInterval(o.capTimer)
    try { closeSync(o.logFd) } catch { /* already closed */ }
    owned.delete(key)
  }

  /** Forget groups that no longer exist, so a recycled pgid is never signalled. */
  function prune() {
    for (const [key, o] of owned) if (!groupAlive(o.pgid)) release(key)
  }

  async function statusOf(app) {
    const up = await isPortUp(app.port)
    const o = owned.get(app.key)
    const startedByLauncher = o !== undefined
    const state = up ? (startedByLauncher ? 'running' : 'external') : startedByLauncher ? 'starting' : 'stopped'
    return {
      key: app.key, name: app.name, port: app.port, url: app.url, hostedUrl: app.hostedUrl,
      up, startedByLauncher, state,
      canStop: startedByLauncher,
      startedAt: o ? o.startedAt : null,
      error: lastError.get(app.key) ?? null,
    }
  }

  async function status() {
    prune()
    return Promise.all(apps.map(statusOf))
  }

  async function start(key) {
    const app = appOrThrow(key)
    prune()
    if (owned.has(key)) throw new LauncherError(409, 'already-started', `${app.name} was already started by the launcher`)
    if (await isPortUp(app.port)) throw new LauncherError(409, 'port-in-use', `Port ${app.port} is already in use (${app.name} may be running from another session)`)
    const cwd = resolve(baseDir, app.folder)
    if (!existsSync(cwd)) throw new LauncherError(500, 'missing-folder', `Folder not found: ${app.folder}`)

    lastError.delete(key)
    // Truncate the file on every start so logs never grow forever; the cap check below covers a long-running app.
    // Opened for append so the app's writes always land at the end, even after the cap check empties the file.
    writeFileSync(logPath(key), '')
    const logFd = openSync(logPath(key), 'a')
    const [cmd, ...args] = app.command
    const child = spawnFn(cmd, args, { cwd, detached: true, stdio: ['ignore', logFd, logFd], env: process.env })
    if (!child.pid) {
      closeSync(logFd)
      throw new LauncherError(500, 'spawn-failed', `Could not start ${app.name}`)
    }
    child.unref()
    const entry = { pgid: child.pid, startedAt: new Date().toISOString(), logFd, capTimer: null }
    entry.capTimer = setInterval(() => capLog(key, entry), logCheckMs)
    entry.capTimer.unref()
    owned.set(key, entry)
    child.once('error', (err) => { lastError.set(key, `Could not run "${cmd}": ${err.message}`); release(key) })
    child.once('exit', () => { if (owned.get(key) === entry && !groupAlive(entry.pgid)) release(key) })
    return { key, pgid: entry.pgid }
  }

  function capLog(key, entry) {
    try {
      if (statSync(logPath(key)).size > LOG_CAP_BYTES) {
        ftruncateSync(entry.logFd, 0)
        writeSync(entry.logFd, '[log truncated: it passed 1 MB]\n')
      }
    } catch { /* file gone: nothing to cap */ }
  }

  async function stop(key) {
    const app = appOrThrow(key)
    prune()
    const o = owned.get(key)
    if (!o) {
      if (await isPortUp(app.port)) throw new LauncherError(409, 'not-started-by-launcher', `${app.name} is running but the launcher did not start it, so it will not stop it`)
      throw new LauncherError(409, 'not-running', `${app.name} is not running`)
    }
    const gone = () => !groupAlive(o.pgid)
    const portFree = async () => !(await isPortUp(app.port))
    const settled = async () => gone() && (await portFree())

    try { process.kill(-o.pgid, 'SIGTERM') } catch (e) { if (e.code !== 'ESRCH') throw e }
    let ok = await waitUntil(settled, { timeoutMs: termGraceMs })
    let forced = false
    if (!ok) {
      forced = true
      try { process.kill(-o.pgid, 'SIGKILL') } catch (e) { if (e.code !== 'ESRCH') throw e }
      ok = await waitUntil(settled, { timeoutMs: 3000 })
    }
    if (!ok) throw new LauncherError(500, 'still-running', `${app.name} did not stop: ${gone() ? `port ${app.port} is still in use` : 'its process group is still alive'}`)
    release(key)
    return { key, stopped: true, forced, portFree: true }
  }

  /** Starts every app that is not already up. Apps whose port is taken are skipped, not failed. */
  async function startAll() {
    const started = []
    const skipped = []
    const failed = []
    for (const app of apps) {
      try { await start(app.key); started.push(app.key) } catch (e) {
        if (e instanceof LauncherError && (e.code === 'port-in-use' || e.code === 'already-started')) skipped.push({ key: app.key, reason: e.code })
        else failed.push({ key: app.key, error: e.message })
      }
    }
    return { started, skipped, failed }
  }

  async function stopAll() {
    const stopped = []
    const failed = []
    for (const key of [...owned.keys()]) {
      try { await stop(key); stopped.push(key) } catch (e) { failed.push({ key, error: e.message }) }
    }
    return { stopped, failed }
  }

  function logs(key) {
    appOrThrow(key)
    const path = logPath(key)
    if (!existsSync(path)) return { key, lines: [] }
    const text = readFileSync(path, 'utf8')
    const lines = text.split('\n')
    if (lines[lines.length - 1] === '') lines.pop()
    return { key, lines: lines.slice(-LOG_LINES) }
  }

  return { status, start, stop, startAll, stopAll, logs, ownedKeys: () => [...owned.keys()], ownedPgid: (key) => owned.get(key)?.pgid ?? null }
}
