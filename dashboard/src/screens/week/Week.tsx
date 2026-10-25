// The Week screen (SPEC §3.2): this week vs last for every app, by tag, TaskFlow's weekly goals, and a stacked bar per day.
// Reads only the two weeks it shows. Read-only: the review itself is done in TaskFlow.
import { useMemo } from 'react'
import { useDashboardView, useView } from '../../data/DataProvider'
import { useSettings } from '../../data/useSettings'
import { appByDataKey, appUrl } from '../../lib/apps'
import type { TaskflowGoalRow } from '../../lib/contract'
import { addDays, formatDay, formatDuration, todayToronto } from '../../lib/time'
import { weekWindows } from '../../lib/week'
import { dayBars, formatMetric, tagSplit, weekComparison, weeklyGoals, type ComparisonRow, type WeeklyGoal } from '../../lib/weekView'
import { ChartCard, LazyStacked } from '../charts/ChartCard'
import { tagColor } from '../charts/palette'
import { card, isHosted, linkBtn, muted } from '../home/ui'
import { usePublished } from '../usePublished'

const TONE = { better: 'text-emerald-700 dark:text-emerald-400', worse: 'text-amber-700 dark:text-amber-400', neutral: '' } as const
const ARROW = (d: number | null) => (d === null || d === 0 ? '' : d > 0 ? '▲ ' : '▼ ')
const tf = appByDataKey('taskflow')!
const range = (start: string) => `${formatDay(start)} - ${formatDay(addDays(start, 6))}`

function Comparison({ group, rows }: { group: string; rows: ComparisonRow[] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
      <table className="min-w-full text-left text-sm">
        <caption className="bg-slate-100 px-3 py-2 text-left font-semibold dark:bg-slate-900">{group}</caption>
        <thead><tr className="text-xs text-slate-500">
          <th scope="col" className="px-3 py-1.5 font-medium">Metric</th><th scope="col" className="px-3 py-1.5 font-medium">This week</th>
          <th scope="col" className="px-3 py-1.5 font-medium">Last week</th><th scope="col" className="px-3 py-1.5 font-medium">Change</th>
        </tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.spec.app}-${r.spec.metric}`} data-tone={r.tone} className="border-t border-slate-200 dark:border-slate-800">
              <th scope="row" className="px-3 py-2 font-normal">{r.spec.label}</th>
              <td className="whitespace-nowrap px-3 py-2 font-medium">{formatMetric(r.spec.format, r.current)}</td>
              <td className="whitespace-nowrap px-3 py-2">{formatMetric(r.spec.format, r.previous)}</td>
              <td className={`whitespace-nowrap px-3 py-2 ${TONE[r.tone]}`}>{ARROW(r.delta)}{r.changeText}{r.tone === 'worse' && <span className="sr-only"> (worse)</span>}{r.tone === 'better' && <span className="sr-only"> (better)</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Goals({ goals, hosted }: { goals: WeeklyGoal[]; hosted: boolean }) {
  return (
    <ul className="space-y-3">
      {goals.map((g) => (
        <li key={g.id}>
          <a href={appUrl(tf, g.current.link, hosted)} target="_blank" rel="noreferrer" className="block">
            <div className="flex justify-between gap-3 text-sm">
              <span><strong>{g.name}</strong> <span className="text-slate-500">{g.current.targetLabel}</span></span>
              <span>{g.current.progressText}</span>
            </div>
            <div role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.current.percent} className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
              <div className={`h-2 rounded-full ${g.current.state === 'hit' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${g.current.percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
              {g.current.state === 'hit' ? 'Reached this week. ' : ''}Last week: {g.last ? (g.last.state === 'hit' ? `hit (${g.last.progressText})` : `missed (${g.last.progressText})`) : 'no result'}
            </p>
          </a>
        </li>
      ))}
    </ul>
  )
}

export function Week() {
  const { settings } = useSettings()
  const ready = !!settings
  const ws = settings?.week_starts_on ?? 1
  const hidden = settings?.hidden_apps ?? []
  const { health, readable, now, error: healthError } = usePublished()
  const today = todayToronto(now)
  const windows = weekWindows(today, ws)
  const since = windows.lastWeek // both weeks, and nothing older
  const osWeek = useView('os_week', { since, enabled: ready })
  const tags = useView('os_tag_daily', { since, enabled: ready })
  const productive = useView('os_productive_daily', { since, enabled: ready })
  const goalsView = useDashboardView('taskflow_dashboard_goals', ready && readable.has('taskflow'), { since })

  const rows = useMemo(() => (osWeek.data ? weekComparison(osWeek.data, windows).filter((r) => !hidden.includes(r.spec.app)) : null), [osWeek.data, windows.thisWeek, windows.lastWeek, hidden.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps
  const groups = useMemo(() => {
    const m = new Map<string, ComparisonRow[]>()
    for (const r of rows ?? []) m.set(r.spec.group, [...(m.get(r.spec.group) ?? []), r])
    return [...m.entries()]
  }, [rows])
  const split = useMemo(() => (tags.data ? tagSplit(tags.data, windows) : []), [tags.data, windows.thisWeek, windows.lastWeek]) // eslint-disable-line react-hooks/exhaustive-deps
  const bars = useMemo(() => (tags.data && productive.data ? dayBars(tags.data, productive.data, windows.thisWeek) : null), [tags.data, productive.data, windows.thisWeek])
  const goals = useMemo(() => (goalsView.data ? weeklyGoals(goalsView.data as unknown as TaskflowGoalRow[], today) : []), [goalsView.data, today])

  const error = healthError ?? osWeek.error ?? tags.error ?? productive.error ?? goalsView.error
  const loading = !ready || !osWeek.data || !tags.data || !productive.data
  const anyPublished = (health ?? []).some((h) => readable.has(h.dataKey))
  const hosted = isHosted()

  return (
    <section>
      <h1 className="text-2xl font-semibold">Week</h1>
      <p className={`mt-1 ${muted}`}>{range(windows.thisWeek)} compared with {range(windows.lastWeek)}</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Couldn't load the week: {error}</p>}
      {!error && loading && <p role="status" className={`mt-3 ${muted}`}>Loading…</p>}
      {health && !anyPublished && <p className="mt-3 rounded-lg bg-slate-200 p-3 text-sm dark:bg-slate-800">No apps have published data yet, so there is nothing to compare.</p>}

      {rows && (
        <div className="mt-4 space-y-4">
          <p className="flex flex-wrap items-center gap-3">
            <a className={linkBtn} href={appUrl(tf, '/review', hosted)} target="_blank" rel="noreferrer">Do the review in TaskFlow</a>
            <span className={muted}>Notes, ratings and the weekly summary live there.</span>
          </p>

          {anyPublished && groups.length === 0 && <p className={muted}>No numbers for either week yet.</p>}
          {groups.map(([group, g]) => <Comparison key={group} group={group} rows={g} />)}

          {split.length > 0 && (
            <section aria-label="Productive time by tag" className={card}>
              <h2 className="mb-1 text-base font-semibold">Productive time by tag</h2>
              <p className={`mb-2 ${muted}`}>Study and hustle only. Minutes an app measured itself are counted once: the larger of TaskFlow's and the app's own.</p>
              <table className="min-w-full text-left text-sm">
                <thead><tr className="text-xs text-slate-500"><th scope="col" className="py-1 font-medium">Tag</th><th scope="col" className="py-1 font-medium">This week</th><th scope="col" className="py-1 font-medium">Last week</th><th scope="col" className="py-1 font-medium">Change</th></tr></thead>
                <tbody>
                  {split.map((t) => (
                    <tr key={t.tagPath} className="border-t border-slate-200 dark:border-slate-800">
                      <th scope="row" className="py-1.5 font-normal"><span aria-hidden className="mr-2 inline-block size-2.5 rounded-sm align-middle" style={{ background: tagColor(t.parent) }} />{t.tagPath}</th>
                      <td className="py-1.5 font-medium">{formatDuration(t.current)}</td><td className="py-1.5">{formatDuration(t.previous)}</td>
                      <td className="py-1.5">{t.delta === 0 ? 'No change' : `${ARROW(t.delta)}${t.delta > 0 ? 'Up' : 'Down'} ${formatDuration(Math.abs(t.delta))}`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <section aria-label="Weekly goals" className={card}>
            <h2 className="mb-3 text-base font-semibold">Weekly goals</h2>
            {!readable.has('taskflow') ? <p className={muted}>TaskFlow hasn't published yet, so there are no goals to show.</p>
              : goals.length === 0 ? <p className={muted}>No weekly goals. <a className="underline" href={appUrl(tf, '/goals', hosted)} target="_blank" rel="noreferrer">Set them in TaskFlow</a>.</p>
              : <Goals goals={goals} hosted={hosted} />}
          </section>

          {bars && (
            <ChartCard
              title="Productive time per day" hasData={bars.bars.some((b) => b.total > 0)} emptyText="No productive time recorded this week."
              note="Days off are grey. Each bar is study + hustle across apps."
              columns={[{ key: 'label', label: 'Day' }, ...bars.series.map((s) => ({ key: s, label: s, fmt: (v: unknown) => formatDuration(Number(v)) })), { key: 'total', label: 'Total', fmt: (v) => formatDuration(Number(v)) }, { key: 'off', label: 'Day off' }]}
              rows={bars.bars.map((b) => ({ label: formatDay(b.day), ...Object.fromEntries(bars.series.map((s) => [s, b.parts[s] ?? 0])), total: b.total, off: b.isDayOff ? 'Day off' : '' }))}
            >
              <LazyStacked unit="minutes" greyKeys={bars.bars.filter((b) => b.isDayOff).map((b) => b.day)}
                series={bars.series.map((s) => ({ key: s, label: s, color: tagColor(s) }))}
                data={bars.bars.map((b) => ({ key: b.day, label: formatDay(b.day).split(' ')[0]!, ...Object.fromEntries(bars.series.map((s) => [s, b.parts[s] ?? 0])) }))} />
            </ChartCard>
          )}
        </div>
      )}
    </section>
  )
}
