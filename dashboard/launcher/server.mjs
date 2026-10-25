// PersonalOS launcher: `node launcher/server.mjs [--start-all]`. Binds 127.0.0.1 only.
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadApps } from './config.mjs'
import { createLauncherServer } from './http.mjs'
import { createManager } from './manager.mjs'
import { isPortUp } from './ports.mjs'

const PORT = 5171
const here = dirname(fileURLToPath(import.meta.url))
const manager = createManager({
  apps: loadApps(join(here, 'apps.json')),
  baseDir: resolve(here, '..', '..'), // the PersonalOS root: app folders are siblings of dashboard/
  logDir: join(here, 'logs'),
})

if (await isPortUp(PORT)) {
  console.error(`[launcher] port ${PORT} is already in use, so the launcher will not start (it never picks another port).`)
  process.exit(1)
}

const server = createLauncherServer(manager)
server.listen(PORT, '127.0.0.1', async () => {
  console.log(`[launcher] listening on http://127.0.0.1:${PORT}`)
  if (process.argv.includes('--start-all')) {
    const { started, skipped, failed } = await manager.startAll()
    if (started.length) console.log(`[launcher] started: ${started.join(', ')}`)
    for (const s of skipped) console.log(`[launcher] skipped ${s.key}: port already in use (running from another session?)`)
    for (const f of failed) console.error(`[launcher] could not start ${f.key}: ${f.error}`)
  }
})

// On exit, stop only the process groups this launcher started. If the launcher is killed hard, those apps keep
// running and show up as "already running" with Stop disabled, which is the safe failure.
let closing = false
async function shutdown() {
  if (closing) return
  closing = true
  server.close()
  const r = await manager.stopAll()
  if (r.stopped.length) console.log(`[launcher] stopped: ${r.stopped.join(', ')}`)
  for (const f of r.failed) console.error(`[launcher] could not stop ${f.key}: ${f.error}`)
  process.exit(0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
