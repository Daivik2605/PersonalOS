import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../app/auth'
import type { OsViewName, OsViewRows } from '../lib/contract'
import { supabase } from '../lib/supabase'
import { loadSampleSource } from './loadSample'
import { decideSample, readStoredSample, storeSample } from './sampleFlag'
import { supabaseSource, ViewMissingError, type DashRow, type DataSource } from './source'

export const REFRESH_MS = 60_000
const FOCUS_DEBOUNCE_MS = 5_000

interface DataCtx {
  source: DataSource | null
  /** Bumps on window focus and every 60 s; views refetch when it changes. */
  tick: number
  /** Last time any request succeeded. */
  lastOkAt: Date | null
  /** The last request failed (Supabase unreachable); screens keep showing what they loaded. */
  unreachable: boolean
  report: (ok: boolean) => void
  refresh: () => void
  sample: boolean
  /** Dev only: undefined in a production build. */
  setSample?: (on: boolean) => void
}

const Ctx = createContext<DataCtx | null>(null)

export function DataProvider({ children, sourceOverride }: { children: ReactNode; sourceOverride?: DataSource }) {
  const { session } = useAuth()
  const userId = session?.user.id ?? null
  const dev = import.meta.env.DEV
  const [sample, setSampleState] = useState(() => {
    const d = decideSample(dev, window.location.search, readStoredSample())
    if (d.persist) storeSample(d.persist)
    return d.on
  })
  const [sampleSource, setSampleSource] = useState<DataSource | null>(null)
  const [tick, setTick] = useState(0)
  const [lastOkAt, setLastOkAt] = useState<Date | null>(null)
  const [unreachable, setUnreachable] = useState(false)
  const lastTick = useRef(Date.now())

  useEffect(() => {
    if (!sample || sourceOverride) { setSampleSource(null); return }
    let live = true
    void loadSampleSource().then((s) => { if (live) setSampleSource(s) })
    return () => { live = false }
  }, [sample, sourceOverride])

  const real = useMemo(() => (supabase && userId ? supabaseSource(supabase, userId) : null), [userId])
  const source = sourceOverride ?? (sample ? sampleSource : real)

  const refresh = useCallback(() => { lastTick.current = Date.now(); setTick((t) => t + 1) }, [])
  useEffect(() => {
    const id = setInterval(refresh, REFRESH_MS)
    const onFocus = () => { if (document.visibilityState !== 'hidden' && Date.now() - lastTick.current > FOCUS_DEBOUNCE_MS) refresh() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus); document.removeEventListener('visibilitychange', onFocus) }
  }, [refresh])

  const report = useCallback((ok: boolean) => {
    setUnreachable(!ok)
    if (ok) setLastOkAt(new Date())
  }, [])

  const setSample = useCallback((on: boolean) => { storeSample(on ? '1' : '0'); setSampleState(on); setLastOkAt(null); setUnreachable(false) }, [])

  const value = useMemo<DataCtx>(
    () => ({ source, tick, lastOkAt, unreachable, report, refresh, sample: sourceOverride ? sourceOverride.kind === 'sample' : sample, setSample: dev ? setSample : undefined }),
    [source, tick, lastOkAt, unreachable, report, refresh, sample, sourceOverride, dev, setSample],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useData(): DataCtx {
  const c = useContext(Ctx)
  if (!c) throw new Error('useData outside DataProvider')
  return c
}

export interface ViewState<T> {
  data: T | null
  loading: boolean
  error: string | null
  /** When this data was loaded (kept across failed refreshes). */
  loadedAt: Date | null
}

/** Fetches an os_ view (limited to `since` when given); refetches on every tick; on failure keeps the last loaded data and flags the provider.
 *  Changing `since` (a new range) drops the old rows at once so a range never shows another range's data. `enabled: false` waits (e.g. for settings). */
export function useView<N extends OsViewName>(name: N, opts: { since?: string; earliest?: boolean; enabled?: boolean } = {}): ViewState<OsViewRows[N]> {
  const { since, earliest = false, enabled = true } = opts
  const { source, tick, report } = useData()
  const [state, setState] = useState<ViewState<OsViewRows[N]>>({ data: null, loading: true, error: null, loadedAt: null })
  const keyRef = useRef(`${name}|${since}|${earliest}`)
  const sourceRef = useRef(source)

  useEffect(() => {
    const key = `${name}|${since}|${earliest}`
    if (sourceRef.current !== source || keyRef.current !== key) { sourceRef.current = source; keyRef.current = key; setState({ data: null, loading: true, error: null, loadedAt: null }) }
    if (!source || !enabled) return
    let live = true
    source.view(name, since || earliest ? { ...(since ? { since } : {}), ...(earliest ? { earliest } : {}) } : undefined).then(
      (data) => { if (live) { setState({ data, loading: false, error: null, loadedAt: new Date() }); report(true) } },
      (e: unknown) => { if (live) { setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })); report(false) } },
    )
    return () => { live = false }
  }, [source, name, since, earliest, enabled, tick, report])

  return state
}

/**
 * Fetches a published app view (`taskflow_dashboard_goals`, ...), limited to `opts` (`since` / `days` / `earliest`). `enabled` is false
 * until Data health says the app is published, so an unpublished app is never queried (no error, no fake zero). Rows are null until
 * loaded or while disabled; changing the range drops the old rows at once.
 */
export function useDashboardView(name: string, enabled: boolean, opts: { days?: number; since?: string; earliest?: boolean } = {}): ViewState<DashRow[]> {
  const { days, since, earliest = false } = opts
  const { source, tick, report } = useData()
  const [state, setState] = useState<ViewState<DashRow[]>>({ data: null, loading: enabled, error: null, loadedAt: null })
  const keyRef = useRef(`${name}|${days}|${since}|${earliest}`)

  useEffect(() => {
    const key = `${name}|${days}|${since}|${earliest}`
    if (keyRef.current !== key) { keyRef.current = key; setState({ data: null, loading: enabled, error: null, loadedAt: null }) }
    if (!enabled) { setState((s) => (s.data === null && !s.loading && !s.error ? s : { data: null, loading: false, error: null, loadedAt: null })); return }
    if (!source) return
    let live = true
    source.dashboardView(name, days || since || earliest ? { ...(days ? { days } : {}), ...(since ? { since } : {}), ...(earliest ? { earliest } : {}) } : undefined).then(
      (data) => { if (live) { setState({ data, loading: false, error: null, loadedAt: new Date() }); report(true) } },
      (e: unknown) => {
        if (!live) return
        if (e instanceof ViewMissingError) { setState({ data: null, loading: false, error: null, loadedAt: null }); report(true); return }
        setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })); report(false)
      },
    )
    return () => { live = false }
  }, [source, name, enabled, days, since, earliest, tick, report])

  return state
}
