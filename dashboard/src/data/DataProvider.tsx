import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from '../app/auth'
import type { OsViewName, OsViewRows } from '../lib/contract'
import { supabase } from '../lib/supabase'
import { loadSampleSource } from './loadSample'
import { decideSample, readStoredSample, storeSample } from './sampleFlag'
import { supabaseSource, type DataSource } from './source'

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

/** Fetches an os_ view; refetches on every tick; on failure keeps the last loaded data and flags the provider. */
export function useView<N extends OsViewName>(name: N): ViewState<OsViewRows[N]> {
  const { source, tick, report } = useData()
  const [state, setState] = useState<ViewState<OsViewRows[N]>>({ data: null, loading: true, error: null, loadedAt: null })
  const sourceRef = useRef(source)

  useEffect(() => {
    if (sourceRef.current !== source) { sourceRef.current = source; setState({ data: null, loading: true, error: null, loadedAt: null }) }
    if (!source) return
    let live = true
    source.view(name).then(
      (data) => { if (live) { setState({ data, loading: false, error: null, loadedAt: new Date() }); report(true) } },
      (e: unknown) => { if (live) { setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : String(e) })); report(false) } },
    )
    return () => { live = false }
  }, [source, name, tick, report])

  return state
}
