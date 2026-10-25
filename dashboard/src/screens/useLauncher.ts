import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createLauncherClient, launcherMode, type AppStatus, type BatchResult, type CallResult, type LauncherClient, type LauncherMode } from '../lib/launcher'

export type LauncherView =
  | { phase: 'loading' }
  | { phase: 'offline' }
  | { phase: 'ok'; apps: AppStatus[] }

const POLL_MS = 3000

export function useLauncher(
  mode: LauncherMode = launcherMode(import.meta.env.VITE_LAUNCHER_URL as string | undefined, window.location.origin),
  clientOverride?: LauncherClient,
) {
  const url = mode.kind === 'enabled' ? mode.url : null
  const client = useMemo(() => clientOverride ?? (url ? createLauncherClient(url) : null), [clientOverride, url])
  const [view, setView] = useState<LauncherView>({ phase: 'loading' })
  const [busy, setBusy] = useState<string | null>(null) // an app key, or 'all'
  const [message, setMessage] = useState<string | null>(null)
  const alive = useRef(true)

  const refresh = useCallback(async () => {
    if (!client) return
    const r = await client.status()
    if (!alive.current) return
    setView(r.ok ? { phase: 'ok', apps: r.data.apps } : { phase: 'offline' })
  }, [client])

  useEffect(() => {
    alive.current = true
    if (!client) return
    void refresh()
    const id = setInterval(() => void refresh(), POLL_MS)
    return () => { alive.current = false; clearInterval(id) }
  }, [client, refresh])

  const run = useCallback(async (who: string, fn: (c: LauncherClient) => Promise<CallResult<unknown>>, describe?: (d: unknown) => string | null) => {
    if (!client) return
    setBusy(who); setMessage(null)
    const r = await fn(client)
    if (!alive.current) return
    if (!r.ok) setMessage(r.offline ? 'The launcher is not running.' : r.message)
    else setMessage(describe?.(r.data) ?? null)
    await refresh()
    if (alive.current) setBusy(null)
  }, [client, refresh])

  const batchNote = (d: unknown) => {
    const b = d as BatchResult
    const parts: string[] = []
    if (b.skipped?.length) parts.push(`Skipped (already running elsewhere): ${b.skipped.map((s) => s.key).join(', ')}.`)
    if (b.failed?.length) parts.push(`Failed: ${b.failed.map((f) => `${f.key} (${f.error})`).join('; ')}.`)
    return parts.join(' ') || null
  }

  return {
    mode, view, busy, message,
    start: (key: string) => run(key, (c) => c.start(key)),
    stop: (key: string) => run(key, (c) => c.stop(key)),
    startAll: () => run('all', (c) => c.startAll(), batchNote),
    stopAll: () => run('all', (c) => c.stopAll(), batchNote),
    loadLogs: async (key: string) => { const r = client ? await client.logs(key) : null; return r && r.ok ? r.data.lines : null },
  }
}
