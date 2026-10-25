import { useData } from '../data/DataProvider'
import { ago } from '../lib/health'
import { useNow } from './useNow'

/** Permanent while sample-data mode is on (SPEC §1). */
export function SampleBanner() {
  const { sample, setSample } = useData()
  if (!sample) return null
  return (
    <div role="status" className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-violet-100 px-4 py-2 text-sm text-violet-900 dark:bg-violet-900/40 dark:text-violet-100">
      <strong>Sample data</strong>
      <span>Made-up numbers for building the screens, not your real data.</span>
      {setSample && <button className="underline" onClick={() => setSample(false)}>Use real data</button>}
    </div>
  )
}

/** Supabase unreachable: keep showing what was loaded, and say so (the browser-offline case is OfflineBanner). */
export function UnreachableBanner() {
  const { unreachable, lastOkAt } = useData()
  const now = useNow()
  if (!unreachable) return null
  return (
    <div role="alert" className="bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      Can't reach the database. {lastOkAt ? `Showing the data loaded ${ago(lastOkAt, now)}.` : 'Nothing has loaded yet.'}
    </div>
  )
}

/** "Updated 1 min ago": always visible in the header. */
export function UpdatedAt() {
  const { lastOkAt } = useData()
  const now = useNow()
  return <p className="text-xs text-slate-500" aria-live="off">{lastOkAt ? `Updated ${ago(lastOkAt, now)}` : 'Not loaded yet'}</p>
}
