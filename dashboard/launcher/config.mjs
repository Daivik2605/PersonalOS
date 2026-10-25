// Loads launcher/apps.json. Only what is listed here can ever be run (SPEC §4).
import { readFileSync } from 'node:fs'

const KEY = /^[a-z0-9][a-z0-9-]*$/

export function parseApps(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('apps.json must be a non-empty array')
  const seenKeys = new Set()
  const seenPorts = new Set()
  return raw.map((a, i) => {
    const at = `apps.json[${i}]`
    if (typeof a?.key !== 'string' || !KEY.test(a.key)) throw new Error(`${at}: bad key`)
    if (seenKeys.has(a.key)) throw new Error(`${at}: duplicate key ${a.key}`)
    seenKeys.add(a.key)
    if (typeof a.name !== 'string' || !a.name) throw new Error(`${at}: name required`)
    if (typeof a.folder !== 'string' || !a.folder || a.folder.startsWith('/') || a.folder.split('/').includes('..')) {
      throw new Error(`${at}: folder must be a relative path inside PersonalOS`)
    }
    if (!Array.isArray(a.command) || a.command.length === 0 || a.command.some((c) => typeof c !== 'string' || !c)) {
      throw new Error(`${at}: command must be an argv array of strings`)
    }
    if (!Number.isInteger(a.port) || a.port < 1024 || a.port > 65535) throw new Error(`${at}: bad port`)
    if (seenPorts.has(a.port)) throw new Error(`${at}: duplicate port ${a.port}`)
    seenPorts.add(a.port)
    return {
      key: a.key, name: a.name, folder: a.folder, command: [...a.command], port: a.port,
      url: typeof a.url === 'string' ? a.url : `http://localhost:${a.port}`,
      hostedUrl: typeof a.hostedUrl === 'string' ? a.hostedUrl : null,
    }
  })
}

export function loadApps(path) {
  return parseApps(JSON.parse(readFileSync(path, 'utf8')))
}
