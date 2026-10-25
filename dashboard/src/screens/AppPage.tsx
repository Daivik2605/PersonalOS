// One page per app (SPEC §3.4): every `_now` extra and every `_daily` column, shown generically, so a column an app adds
// later appears with no code change.
import { useMemo } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useNow } from '../app/useNow'
import { useDashboardView, useView } from '../data/DataProvider'
import { appByDataKey, appUrl } from '../lib/apps'
import { dailyColumns, formatCell, labelOf, lastDays, nowExtras } from '../lib/appPage'
import { ago, allAppHealth } from '../lib/health'
import { isHosted, linkBtn, muted } from './home/ui'

const DAYS = 30
const STATE_TEXT = { 'not-published': 'Not published yet', 'contract-broken': 'Contract problem', 'needs-rerun': 'Valid, not included yet', ok: 'Contract OK' } as const

export function AppPage() {
  const { key = '' } = useParams()
  const app = appByDataKey(key)
  const now = useNow()
  const healthRows = useView('os_contract_health')
  const nowRows = useView('os_apps_now')
  const health = useMemo(() => (healthRows.data ? allAppHealth(healthRows.data, nowRows.data ?? [], now).find((h) => h.dataKey === key) : undefined), [healthRows.data, nowRows.data, now, key])
  const readable = health?.state === 'ok' || health?.state === 'needs-rerun'
  const nowView = useDashboardView(`${key}_dashboard_now`, !!app && readable)
  const dailyView = useDashboardView(`${key}_dashboard_daily`, !!app && readable, DAYS)
  if (!app) return <Navigate to="/" replace />

  const row = nowView.data?.[0]
  const days = dailyView.data ? lastDays(dailyView.data, DAYS) : null
  const cols = days ? dailyColumns(days) : []
  const extras = row ? nowExtras(row) : []
  const hosted = isHosted()

  return (
    <section>
      <p className="text-sm"><Link to="/" className="underline">Home</Link></p>
      <h1 className="text-2xl font-semibold">{app.name}</h1>
      {!health ? (
        <p role="status" className={`mt-2 ${muted}`}>{healthRows.error ? `Couldn't load: ${healthRows.error}` : 'Loading…'}</p>
      ) : !readable ? (
        <p className={`mt-2 ${muted}`}>{STATE_TEXT[health.state]}.{health.state === 'not-published' ? ' This app has not published its dashboard views yet, so there is nothing to show.' : ' Check Data health on System.'}</p>
      ) : (
        <>
          {row && <p className="mt-1">{formatCell(row.status_line)}</p>}
          <p className={`mt-1 ${muted}`}>
            {STATE_TEXT[health.state]}{health.contractVersion !== null ? `, contract v${health.contractVersion}` : ''} · Updated {ago(health.updatedAt, now)} · Last activity {ago(health.lastActivityAt, now)}
            {health.stale && ' · Stale: no sync for more than 2 days'}
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {app.links.map((l) => <li key={l.path}><a className={linkBtn} href={appUrl(app, l.path, hosted)} target="_blank" rel="noreferrer">{l.label === 'Open' ? `Open ${app.name}` : l.label}</a></li>)}
          </ul>

          <h2 className="mb-2 mt-6 text-lg font-semibold">Now</h2>
          {nowView.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">Couldn't load: {nowView.error}</p>}
          {row && (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
              {['needs_attention', 'attention_label', ...extras].map((c) => (
                <div key={c}><dt className="text-xs text-slate-500">{labelOf(c)}</dt><dd className="font-medium">{formatCell(row[c])}</dd></div>
              ))}
            </dl>
          )}
          {!row && !nowView.error && <p className={muted}>{nowView.loading ? 'Loading…' : 'No data'}</p>}

          <h2 className="mb-2 mt-6 text-lg font-semibold">Last {DAYS} days</h2>
          {dailyView.error && <p role="alert" className="text-sm text-red-700 dark:text-red-300">Couldn't load: {dailyView.error}</p>}
          {days && days.length === 0 && <p className={muted}>No days recorded in the last {DAYS} days. A day with no row means no activity.</p>}
          {days && days.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-100 dark:bg-slate-900"><tr>{cols.map((c) => <th key={c} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{labelOf(c)}</th>)}</tr></thead>
                <tbody>
                  {days.map((d) => (
                    <tr key={String(d.day)} className="border-t border-slate-200 dark:border-slate-800">
                      {cols.map((c) => <td key={c} className="whitespace-nowrap px-3 py-2">{formatCell(d[c])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!days && !dailyView.error && <p className={muted}>{dailyView.loading ? 'Loading…' : 'No data'}</p>}
        </>
      )}
    </section>
  )
}
