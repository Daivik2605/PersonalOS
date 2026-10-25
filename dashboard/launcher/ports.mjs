// Is something listening on this port? Vite binds "localhost", which on macOS can be ::1 only, so a check that
// connects to 127.0.0.1 alone would call a running app "down". We try both and say "up" if either answers.
// Used by the launcher (status, stop polling) and by start-os.sh through port-up.mjs.
import net from 'node:net'
import { fileURLToPath } from 'node:url'

export const LOOPBACK_HOSTS = ['127.0.0.1', '::1']

function connects(port, host, timeoutMs) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    const done = (ok) => { socket.destroy(); resolve(ok) }
    socket.setTimeout(timeoutMs, () => done(false))
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false)) // refused, or no IPv6 on this machine: not listening there
  })
}

export async function isPortUp(port, { hosts = LOOPBACK_HOSTS, timeoutMs = 400 } = {}) {
  const results = await Promise.all(hosts.map((h) => connects(port, h, timeoutMs)))
  return results.some(Boolean)
}

export async function waitUntil(predicate, { timeoutMs, intervalMs = 100 }) {
  const end = Date.now() + timeoutMs
  for (;;) {
    if (await predicate()) return true
    if (Date.now() >= end) return false
    await new Promise((r) => setTimeout(r, intervalMs))
  }
}

// CLI for shell scripts: `node port-up.mjs 5170` exits 0 when up, 1 when free.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2])
  if (!Number.isInteger(port)) { console.error('usage: node ports.mjs <port>'); process.exit(2) }
  process.exit((await isPortUp(port)) ? 0 : 1)
}
