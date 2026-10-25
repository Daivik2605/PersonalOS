import { lazy, Suspense, useState, type ReactNode } from 'react'
import { card, muted } from '../home/ui'

// The chart code (Recharts) is a separate chunk, fetched only when a chart is first shown.
export const LazyStacked = lazy(() => import('./Charts').then((m) => ({ default: m.StackedBars })))
export const LazyBarsLine = lazy(() => import('./Charts').then((m) => ({ default: m.BarsLine })))
export const LazyGrouped = lazy(() => import('./Charts').then((m) => ({ default: m.GroupedBars })))
export const LazyLines = lazy(() => import('./Charts').then((m) => ({ default: m.MultiLines })))

export interface TableCol { key: string; label: string; fmt?: (v: unknown) => string }
type Cell = string | number | boolean | null | undefined

export interface ChartCardProps {
  title: string
  /** The counting rule or caveat that belongs to this chart. */
  note?: string
  columns: TableCol[]
  rows: Record<string, Cell>[]
  /** False shows `emptyText` instead (and no chart): nothing to draw. */
  hasData: boolean
  emptyText?: string
  /** Extra controls next to the title (e.g. by tag / by sub-tag). */
  controls?: ReactNode
  /** The chart itself (one of the Lazy* elements). */
  children: ReactNode
}

/** A card with a chart and a "Show as table" switch. The table has exactly the numbers the chart draws. */
export function ChartCard(p: ChartCardProps) {
  const [table, setTable] = useState(false)
  return (
    <section aria-label={p.title} className={card}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{p.title}</h2>
        <div className="flex items-center gap-2">
          {p.controls}
          {p.hasData && <button className="min-h-11 rounded-lg px-3 text-sm underline" aria-pressed={table} onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show as table'}</button>}
        </div>
      </div>
      {p.note && <p className={`mb-2 ${muted}`}>{p.note}</p>}
      {!p.hasData ? (
        <p className={muted}>{p.emptyText ?? 'No data in this range.'}</p>
      ) : table ? (
        <div className="max-h-80 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-100 dark:bg-slate-900"><tr>{p.columns.map((c) => <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-2 font-medium">{c.label}</th>)}</tr></thead>
            <tbody>
              {p.rows.map((r, i) => (
                <tr key={i} className="border-t border-slate-200 dark:border-slate-800">
                  {p.columns.map((c) => <td key={c.key} className="whitespace-nowrap px-3 py-1.5">{r[c.key] === null || r[c.key] === undefined ? 'No data' : c.fmt ? c.fmt(r[c.key]) : String(r[c.key])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Suspense fallback={<p role="status" className={muted}>Loading chart…</p>}>{p.children}</Suspense>
      )}
    </section>
  )
}
