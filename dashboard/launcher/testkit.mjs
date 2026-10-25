// Helpers shared by the launcher tests: real sockets, real processes, temp folders.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import net from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export function freePort(host = '127.0.0.1') {
  return new Promise((resolve, reject) => {
    const s = net.createServer()
    s.once('error', reject)
    s.listen(0, host, () => { const { port } = s.address(); s.close(() => resolve(port)) })
  })
}

export async function hasIPv6() {
  try { await freePort('::1'); return true } catch { return false }
}

export function listen(port, host) {
  return new Promise((resolve, reject) => {
    const s = net.createServer((c) => c.end())
    s.once('error', reject)
    s.listen(port, host, () => resolve(s))
  })
}

export const closeServer = (s) => new Promise((r) => s.close(() => r()))

/**
 * A fake app that behaves like `npm run dev`: a shell wrapper (the "npm") that runs a node server (the "vite") as a
 * child. Killing only the wrapper's PID would leave the server holding the port. The server prints its own PID.
 */
export function makeFixtureBase({ host = '127.0.0.1' } = {}) {
  const base = mkdtempSync(join(tmpdir(), 'os-launcher-'))
  const dir = join(base, 'fx')
  mkdirSync(dir)
  writeFileSync(join(dir, 'server.js'), `
    const net = require('net')
    const s = net.createServer((c) => c.end())
    s.listen(Number(process.env.FX_PORT), ${JSON.stringify(host)}, () => console.log('SERVER_PID=' + process.pid))
    process.on('SIGTERM', () => { if (process.env.FX_IGNORE_TERM) return; process.exit(0) })
  `)
  // No exec: sh stays alive as the parent, like npm does.
  writeFileSync(join(dir, 'run.sh'), 'node server.js\necho wrapper-finished\n')
  return base
}

export const fixtureApp = (key, port) => ({
  key, name: key, folder: 'fx', command: ['sh', 'run.sh'], port, url: `http://localhost:${port}`, hostedUrl: null,
})

export const pidAlive = (pid) => { try { process.kill(pid, 0); return true } catch (e) { return e.code === 'EPERM' } }
export const groupGone = (pgid) => { try { process.kill(-pgid, 0); return false } catch (e) { return e.code === 'ESRCH' } }
