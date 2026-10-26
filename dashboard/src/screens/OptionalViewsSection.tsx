import type { OptionalViewHealth } from '../lib/health'

const LABEL: Record<OptionalViewHealth['state'], string> = {
  'in-use': 'In use',
  'not-published': 'Not published yet',
  broken: 'Problem',
  'needs-rerun': 'Valid, not used yet',
}
const DOT: Record<OptionalViewHealth['state'], string> = {
  'in-use': 'bg-emerald-500', 'not-published': 'bg-slate-400', broken: 'bg-red-500', 'needs-rerun': 'bg-amber-400',
}

export interface OptionalViewsProps {
  views: OptionalViewHealth[] | null
  loading: boolean
  /** Set when os_optional_health itself could not be read (for example os_core.sql part 2 hasn't been run). */
  error: string | null
}

export function OptionalViewsSection({ views, loading, error }: OptionalViewsProps) {
  if (error) {
    return <p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Couldn't read the optional views. Re-run <code>supabase/os_core.sql</code> in the SQL Editor.</p>
  }
  if (!views) return loading ? <p role="status" className="text-sm">Loading…</p> : null
  return (
    <ul className="space-y-2">
      {views.map((v) => (
        <li key={v.view} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[v.state]}`} />
            <strong className="break-all">{v.view}</strong>
            <span className="text-sm">{LABEL[v.state]}</span>
          </div>
          {v.state === 'broken' && <p className="mt-1 text-sm text-red-700 dark:text-red-300">This view exists but {v.problem}, so Home is ignoring it. Ask the app to fix the view.</p>}
          {v.state === 'needs-rerun' && <p className="mt-1 text-sm">Re-run <code>supabase/os_core.sql</code> in the SQL Editor so Home uses it.</p>}
          {v.state === 'not-published' && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Optional. Productive time and days off work without it, with less detail.</p>}
        </li>
      ))}
    </ul>
  )
}
