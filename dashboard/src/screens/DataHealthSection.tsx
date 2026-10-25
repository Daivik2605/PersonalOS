import type { AppHealth } from '../lib/health'
import { ago } from '../lib/health'

const LABEL: Record<AppHealth['state'], string> = {
  'not-published': 'Not published yet',
  'contract-broken': 'Contract problem',
  'needs-rerun': 'Valid, not included yet',
  ok: 'Contract OK',
}
const DOT: Record<AppHealth['state'], string> = {
  'not-published': 'bg-slate-400', 'contract-broken': 'bg-red-500', 'needs-rerun': 'bg-amber-400', ok: 'bg-emerald-500',
}

export interface DataHealthProps {
  health: AppHealth[] | null
  now: Date
  loading: boolean
  error: string | null
}

export function DataHealthSection({ health, now, loading, error }: DataHealthProps) {
  return (
    <div>
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
          Couldn't read data health{health ? ' (showing the last result)' : ''}: {error}. If you haven't yet, run <code>supabase/os_core.sql</code> in the Supabase SQL Editor.
        </p>
      )}
      {!health ? (
        !error && loading && <p role="status" className="text-sm">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {health.map((a) => {
            const published = a.state !== 'not-published'
            return (
              <li key={a.dataKey} className="rounded-xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[a.state]}`} />
                  <strong>{a.name}</strong>
                  <span className="text-sm">{LABEL[a.state]}{a.contractVersion !== null && a.state === 'ok' ? `, v${a.contractVersion}` : ''}</span>
                  {a.stale && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">Stale</span>}
                </div>
                {!a.known && <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Found by view name; it is not in Home's app list yet.</p>}
                {a.state === 'needs-rerun' && <p className="mt-1 text-sm">Re-run <code>supabase/os_core.sql</code> in the SQL Editor to include it.</p>}
                {a.problems.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-sm text-red-700 dark:text-red-300">{a.problems.map((p) => <li key={p}>{p}</li>)}</ul>
                )}
                {published && (
                  <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                    Last updated {ago(a.updatedAt, now)} · Last activity {ago(a.lastActivityAt, now)}
                  </p>
                )}
                {a.stale && <p className="mt-1 text-sm">No sync for more than 2 days. Open the app on the device that holds the data.</p>}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
