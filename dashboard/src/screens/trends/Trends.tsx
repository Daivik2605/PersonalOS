// The Trends screen (SPEC §3.3). Every view is asked only for the date range shown (see rangeWindow); charts load lazily.
import { useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useDashboardView, useView } from '../../data/DataProvider'
import { useSettings } from '../../data/useSettings'
import type { MoneyMonthlyRow } from '../../lib/contract'
import { formatCents, type Row } from '../../lib/home'
import { formatDay, formatDuration, todayToronto } from '../../lib/time'
import {
  balanceSeries, BALANCE_SERIES, counterSeries, heatmap, makeBuckets, moneySeries, parseRange, rangeWindow, RANGES, stackedProductive, trendStats, weeklySeries, type WeeklySpec,
} from '../../lib/trends'
import { ChartCard, LazyBarsLine, LazyGrouped, LazyLines, LazyStacked } from '../charts/ChartCard'
import { SERIES_COLORS, tagColor } from '../charts/palette'
import { card, muted } from '../home/ui'
import { usePublished } from '../usePublished'
import { Heatmap } from './Heatmap'

const minutes = (v: unknown) => formatDuration(Number(v))
const dollars = (v: unknown) => formatCents(Number(v) * 100)
const NOT_PUBLISHED = (app: string) => `${app} hasn't published yet.`
const COUNTERS = [{ key: 'cigarettes', label: 'Cigarettes' }, { key: 'weed', label: 'Weed' }] as const
const WEEKLY: readonly WeeklySpec[] = [
  { key: 'work', app: 'taskflow', metric: 'work_minutes', label: 'Work' }, { key: 'commute', app: 'taskflow', metric: 'commute_minutes', label: 'Commute' },
]
const TASKS: readonly WeeklySpec[] = [
  { key: 'done', app: 'taskflow', metric: 'items_done', label: 'Done' }, { key: 'missed', app: 'taskflow', metric: 'tasks_missed', label: 'Missed' },
]

function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div className={card}>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-xl font-semibold">{value ?? <span className="text-base font-normal text-slate-500">No data</span>}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  )
}

export function Trends() {
  const range = parseRange(new URLSearchParams(useLocation().search).get('range'))
  const [level, setLevel] = useState<'parent' | 'sub'>('parent')
  const { settings } = useSettings()
  const ready = !!settings
  const ws = settings?.week_starts_on ?? 1
  const goal = settings?.daily_goal_minutes ?? 240
  const hidden = settings?.hidden_apps ?? []
  const { health, readable, now, error: healthError } = usePublished()
  const today = todayToronto(now)
  const w = useMemo(() => rangeWindow(range, today, ws), [range, today, ws])
  const tf = readable.has('taskflow')
  const money = readable.has('money') && !hidden.includes('money')

  // Each view is limited to what this range needs.
  const tags = useView('os_tag_daily', { since: w.osStart, enabled: ready })
  const productive = useView('os_productive_daily', { since: w.osStart, enabled: ready })
  const firstProd = useView('os_productive_daily', { earliest: true, enabled: ready })
  const streak = useView('os_streak', { enabled: ready })
  const osWeek = useView('os_week', { since: w.weekStart, enabled: ready })
  const tfDaily = useDashboardView('taskflow_dashboard_daily', ready && tf, { since: w.tfStart })
  const tfFirst = useDashboardView('taskflow_dashboard_daily', ready && tf, { earliest: true })
  const monthly = useDashboardView('money_dashboard_monthly', ready && money, { since: w.monthStart })

  const firstDay = firstProd.data?.[0]?.day ?? null
  const tfFirstDay = (tfFirst.data?.[0]?.day as string | undefined) ?? null
  const buckets = useMemo(() => makeBuckets(w.shownStart, today, w.granularity, ws), [w, today, ws])
  const stack = useMemo(() => (tags.data ? stackedProductive(tags.data, buckets, w.granularity, ws, level) : null), [tags.data, buckets, w, ws, level])
  const heat = useMemo(() => (productive.data ? heatmap(productive.data, w.heatStart, today, goal, firstDay) : null), [productive.data, w.heatStart, today, goal, firstDay])
  const stats = useMemo(() => (productive.data ? trendStats(productive.data, today, ws, w.osStart, firstDay, streak.data?.[0]?.longest ?? null) : null), [productive.data, today, ws, w.osStart, firstDay, streak.data])
  const tfRows = tfDaily.data as Row[] | null
  const balance = useMemo(() => (tfRows ? balanceSeries(tfRows, buckets, w.granularity, ws) : null), [tfRows, buckets, w.granularity, ws])
  const counterBuckets = useMemo(() => makeBuckets(range === '12m' ? w.heatStart : w.shownStart, today, range === '12m' ? 'week' : 'day', ws), [range, w, today, ws])
  const weekly = useMemo(() => (osWeek.data ? weeklySeries(osWeek.data, w.weekStart, today, WEEKLY, ws) : null), [osWeek.data, w.weekStart, today, ws])
  const tasks = useMemo(() => (osWeek.data ? weeklySeries(osWeek.data, w.weekStart, today, TASKS, ws) : null), [osWeek.data, w.weekStart, today, ws])
  const moneyPts = useMemo(() => (monthly.data ? moneySeries(monthly.data as unknown as MoneyMonthlyRow[], w.monthStart) : null), [monthly.data, w.monthStart])

  const error = healthError ?? tags.error ?? productive.error ?? osWeek.error ?? tfDaily.error ?? monthly.error ?? streak.error
  const loading = !ready || !tags.data || !productive.data
  const anyPublished = (health ?? []).some((h) => readable.has(h.dataKey))
  const counterDefs = COUNTERS.filter((c) => tfRows?.some((r) => c.key in r))
  const everyOther = w.granularity === 'week' ? 'Weekly totals.' : w.granularity === 'month' ? 'Monthly totals.' : 'Daily.'

  return (
    <section>
      <h1 className="text-2xl font-semibold">Trends</h1>
      <nav aria-label="Range" className="mt-3 flex flex-wrap gap-2">
        {RANGES.map((r) => (
          <Link key={r.id} to={`?range=${r.id}`} replace aria-current={r.id === range ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium ${r.id === range ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{r.label}</Link>
        ))}
      </nav>
      <p className={`mt-2 ${muted}`}>{formatDay(w.shownStart)} to {formatDay(today)}</p>
      {error && <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Couldn't load trends: {error}</p>}
      {!error && loading && <p role="status" className={`mt-3 ${muted}`}>Loading…</p>}
      {health && !anyPublished && <p className="mt-3 rounded-lg bg-slate-200 p-3 text-sm dark:bg-slate-800">No apps have published data yet, so there are no trends to show.</p>}

      {!loading && (
        <div className="mt-4 space-y-4">
          {stats && (
            <dl aria-label="Stats" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="7-day average" value={stats.avg7 === null ? null : formatDuration(stats.avg7)} sub="per day, days off excluded" />
              <Stat label="30-day average" value={stats.avg30 === null ? null : formatDuration(stats.avg30)} sub={stats.avg30 === null && range === '14d' ? 'choose 30 days or more' : 'per day, days off excluded'} />
              <Stat label="Best day" value={stats.bestDay ? formatDuration(stats.bestDay.minutes) : null} sub={stats.bestDay ? formatDay(stats.bestDay.day) : undefined} />
              <Stat label="Best week" value={stats.bestWeek ? formatDuration(stats.bestWeek.minutes) : null} sub={stats.bestWeek ? `week of ${formatDay(stats.bestWeek.weekStart)}` : 'needs a finished week in range'} />
              <Stat label="Longest streak" value={stats.longestStreak === null ? null : `${stats.longestStreak} days`} sub="all time, days off skipped" />
            </dl>
          )}

          {stack && (
            <ChartCard
              title="Productive time by tag" hasData={stack.rows.some((r) => r.total > 0)}
              note={`Study + hustle across apps; an app's own minutes and TaskFlow's are counted once (the larger). ${everyOther}`}
              controls={
                <div role="group" aria-label="Tag level" className="flex gap-1">
                  {(['parent', 'sub'] as const).map((l) => (
                    <button key={l} aria-pressed={level === l} onClick={() => setLevel(l)} className={`min-h-11 rounded-lg border px-3 text-sm ${level === l ? 'border-indigo-600 bg-indigo-600 text-white' : 'border-slate-300 dark:border-slate-700'}`}>{l === 'parent' ? 'By tag' : 'By sub-tag'}</button>
                  ))}
                </div>
              }
              columns={[{ key: 'label', label: w.granularity === 'month' ? 'Month' : w.granularity === 'week' ? 'Week of' : 'Day' }, ...stack.series.map((s) => ({ key: s, label: s, fmt: minutes })), { key: 'total', label: 'Total', fmt: minutes }]}
              rows={stack.rows}
            >
              <LazyStacked unit="minutes" series={stack.series.map((s) => ({ key: s, label: s, color: tagColor(s) }))} data={stack.rows} />
            </ChartCard>
          )}

          {heat && <Heatmap cells={heat} weekStartsOn={ws} goalMinutes={goal} title={range === '12m' ? 'Consistency, the year' : `Consistency, ${heat.length} days`} />}

          {tf ? (
            <>
              <ChartCard
                title="Balance" hasData={!!balance && balance.some((b) => BALANCE_SERIES.some((s) => b[s.key] !== null))} emptyText="No TaskFlow time recorded in this range."
                note="Minutes per day, averaged over the days in each bucket that have a value. Sleep is the night that ended that morning."
                columns={[{ key: 'label', label: 'Period' }, ...BALANCE_SERIES.map((s) => ({ key: s.key, label: s.label, fmt: minutes }))]} rows={balance ?? []}
              >
                <LazyLines unit="minutes" data={balance ?? []} series={BALANCE_SERIES.map((s, i) => ({ key: s.key, label: s.label, color: SERIES_COLORS[(i * 2 + 1) % SERIES_COLORS.length]! }))} />
              </ChartCard>

              <ChartCard
                title="Work and commute per week" hasData={!!weekly && weekly.some((r) => r.work !== null || r.commute !== null)} emptyText="No work recorded in this range."
                note="Paid work time and commute time, per week."
                columns={[{ key: 'label', label: 'Week of' }, { key: 'work', label: 'Work', fmt: minutes }, { key: 'commute', label: 'Commute', fmt: minutes }]} rows={weekly ?? []}
              >
                <LazyStacked unit="minutes" data={weekly ?? []} series={[{ key: 'work', label: 'Work', color: SERIES_COLORS[2]! }, { key: 'commute', label: 'Commute', color: SERIES_COLORS[6]! }]} />
              </ChartCard>

              <ChartCard
                title="Tasks done and missed per week" hasData={!!tasks && tasks.some((r) => r.done !== null || r.missed !== null)} emptyText="No tasks recorded in this range."
                columns={[{ key: 'label', label: 'Week of' }, { key: 'done', label: 'Done' }, { key: 'missed', label: 'Missed' }]} rows={tasks ?? []}
              >
                <LazyGrouped unit="count" data={tasks ?? []} bars={[{ key: 'done', label: 'Done', color: SERIES_COLORS[3]! }, { key: 'missed', label: 'Missed', color: SERIES_COLORS[2]! }]} />
              </ChartCard>

              {counterDefs.map((c) => {
                const pts = counterSeries(tfRows!, c.key, counterBuckets, range === '12m' ? 'week' : 'day', tfFirstDay)
                return (
                  <ChartCard
                    key={c.key} title={`${c.label} ${range === '12m' ? 'per day, weekly average' : 'per day'}`} hasData={pts.some((p) => p.value !== null)} emptyText="No counts in this range."
                    note={range === '12m' ? 'Average per day for each week, since the first day TaskFlow has a row.' : 'The line is the average of the last 7 days (fewer at the start). Days before TaskFlow started are not zeros.'}
                    columns={[{ key: 'label', label: range === '12m' ? 'Week of' : 'Day' }, { key: 'value', label: 'Count' }, ...(range === '12m' ? [] : [{ key: 'avg7', label: '7-day average' }])]} rows={pts}
                  >
                    <LazyBarsLine unit="count" data={pts} bar={{ key: 'value', label: c.label, color: SERIES_COLORS[2]! }} line={range === '12m' ? undefined : { key: 'avg7', label: '7-day average', color: SERIES_COLORS[0]! }} color={SERIES_COLORS[2]!} />
                  </ChartCard>
                )
              })}
            </>
          ) : (
            <section aria-label="TaskFlow charts" className={card}><p className={muted}>{NOT_PUBLISHED('TaskFlow')} Balance, work, tasks and counters appear once it does.</p></section>
          )}

          {money && moneyPts && (
            <>
              <ChartCard
                title="Money in, out and net per month" hasData={moneyPts.length > 0} emptyText="No months in this range."
                columns={[{ key: 'label', label: 'Month' }, { key: 'in', label: 'In', fmt: dollars }, { key: 'out', label: 'Out', fmt: dollars }, { key: 'net', label: 'Net', fmt: dollars }]} rows={moneyPts}
              >
                <LazyGrouped unit="dollars" data={moneyPts} bars={[{ key: 'in', label: 'In', color: SERIES_COLORS[3]! }, { key: 'out', label: 'Out', color: SERIES_COLORS[2]! }]} line={{ key: 'net', label: 'Net', color: SERIES_COLORS[0]! }} />
              </ChartCard>
              <ChartCard
                title="Essentials and discretionary spending" hasData={moneyPts.length > 0} emptyText="No months in this range." note="Money out per month; transfers excluded."
                columns={[{ key: 'label', label: 'Month' }, { key: 'essential', label: 'Essential', fmt: dollars }, { key: 'discretionary', label: 'Discretionary', fmt: dollars }]} rows={moneyPts}
              >
                <LazyStacked unit="dollars" data={moneyPts} series={[{ key: 'essential', label: 'Essential', color: SERIES_COLORS[1]! }, { key: 'discretionary', label: 'Discretionary', color: SERIES_COLORS[4]! }]} />
              </ChartCard>
            </>
          )}
        </div>
      )}
    </section>
  )
}
