// Talks to the local launcher (SPEC §4). The launcher only answers http://localhost:5170 and requires the
// X-PersonalOS header on every POST, so this client always sends it.

import type { BackupInfo } from './health'

export const DASHBOARD_ORIGIN = 'http://localhost:5170'

export type LauncherMode =
  | { kind: 'disabled' }                       // VITE_LAUNCHER_URL unset (hosted): hide every launcher feature
  | { kind: 'wrong-origin'; origin: string }   // launcher would refuse us, so say why instead of "offline"
  | { kind: 'enabled'; url: string }

export function launcherMode(configuredUrl: string | undefined, pageOrigin: string): LauncherMode {
  const url = configuredUrl?.trim().replace(/\/+$/, '')
  if (!url) return { kind: 'disabled' }
  if (pageOrigin !== DASHBOARD_ORIGIN) return { kind: 'wrong-origin', origin: pageOrigin }
  return { kind: 'enabled', url }
}

export type AppState = 'running' | 'external' | 'starting' | 'stopped'

export interface AppStatus {
  key: string
  name: string
  port: number
  url: string
  hostedUrl: string | null
  up: boolean
  startedByLauncher: boolean
  state: AppState
  canStop: boolean
  startedAt: string | null
  error: string | null
}

export type CallResult<T> =
  | { ok: true; data: T }
  | { ok: false; offline: true }                          // launcher not running / unreachable
  | { ok: false; offline: false; code: string; message: string }

export interface BatchResult {
  started?: string[]
  skipped?: { key: string; reason: string }[]
  stopped?: string[]
  failed: { key: string; error: string }[]
}

export function createLauncherClient(baseUrl: string, fetchFn: typeof fetch = fetch.bind(globalThis)) {
  async function call<T>(method: 'GET' | 'POST', path: string): Promise<CallResult<T>> {
    let res: Response
    try {
      res = await fetchFn(`${baseUrl}${path}`, { method, headers: method === 'POST' ? { 'X-PersonalOS': '1' } : undefined })
    } catch {
      return { ok: false, offline: true }
    }
    let body: unknown = null
    try { body = await res.json() } catch { /* non-JSON error body */ }
    if (res.ok) return { ok: true, data: body as T }
    const b = (body ?? {}) as { error?: string; message?: string }
    return { ok: false, offline: false, code: b.error ?? `http-${res.status}`, message: b.message ?? b.error ?? `Launcher answered ${res.status}` }
  }
  const seg = encodeURIComponent
  return {
    status: () => call<{ apps: AppStatus[] }>('GET', '/status'),
    backup: () => call<BackupInfo>('GET', '/backup'),
    logs: (key: string) => call<{ key: string; lines: string[] }>('GET', `/logs/${seg(key)}`),
    start: (key: string) => call<{ key: string }>('POST', `/start/${seg(key)}`),
    stop: (key: string) => call<{ key: string }>('POST', `/stop/${seg(key)}`),
    startAll: () => call<BatchResult>('POST', '/start-all'),
    stopAll: () => call<BatchResult>('POST', '/stop-all'),
  }
}

export type LauncherClient = ReturnType<typeof createLauncherClient>

export const STATE_LABEL: Record<AppState, string> = {
  running: 'Running (started by launcher)',
  external: 'Already running (started elsewhere)',
  starting: 'Starting…',
  stopped: 'Stopped',
}
