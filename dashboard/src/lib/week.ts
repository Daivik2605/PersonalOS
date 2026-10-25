// Week windows and this-vs-last comparisons over `os_week` (SPEC §2.2, §3.2). `weekRows` is the same aggregation as the SQL view
// so sample-data mode shows what the database would; week.test.ts holds hand-calculated cases.
import type { DailyRow, ProductiveDailyRow, WeekRow } from './contract'
import { addDays, weekBounds, type Day } from './time'

/** Which TaskFlow daily extras become weekly metrics, and how (sleep averages only the days that have sleep). Mirrors os_core.sql. */
export const TASKFLOW_WEEK_METRICS: ReadonlyArray<{ column: string; agg: 'sum' | 'avg' }> = [
  { column: 'work_minutes', agg: 'sum' }, { column: 'cigarettes', agg: 'sum' }, { column: 'weed', agg: 'sum' },
  { column: 'tasks_missed', agg: 'sum' }, { column: 'deadlines_missed', agg: 'sum' },
  { column: 'sleep_minutes', agg: 'avg' }, { column: 'mood', agg: 'avg' }, { column: 'energy', agg: 'avg' },
]
export const MONEY_WEEK_COLUMNS: readonly string[] = ['in_cents', 'out_cents', 'essential_out_cents', 'discretionary_out_cents', 'smoking_out_cents']

export interface WindowPair { thisWeek: Day; lastWeek: Day }

/** Start day of the week containing `day`. `weekStartsOn`: 0 = Sunday … 6 = Saturday (default Monday). */
export function weekStartOf(day: Day, weekStartsOn = 1): Day {
  return weekBounds(day, weekStartsOn).start
}

/** This week's and last week's start days. */
export function weekWindows(today: Day, weekStartsOn = 1): WindowPair {
  const thisWeek = weekStartOf(today, weekStartsOn)
  return { thisWeek, lastWeek: addDays(thisWeek, -7) }
}

type Fact = { day: Day; app: string; metric: string; value: number | null; agg: 'sum' | 'avg' }

/** One user's os_week rows from day-level facts (what the SQL view computes). Null values are skipped, like the SQL. */
export function weekRows(
  input: { daily: DailyRow[]; productive: ProductiveDailyRow[]; taskflowDaily?: Record<string, unknown>[]; moneyDaily?: Record<string, unknown>[] },
  weekStartsOn = 1,
  userId = '',
): WeekRow[] {
  const facts: Fact[] = []
  for (const r of input.daily) {
    facts.push({ day: r.day, app: r.app, metric: 'active_minutes', value: r.active_minutes, agg: 'sum' })
    facts.push({ day: r.day, app: r.app, metric: 'items_done', value: r.items_done, agg: 'sum' })
  }
  for (const p of input.productive) {
    facts.push({ day: p.day, app: 'os', metric: 'productive_minutes', value: p.minutes, agg: 'sum' })
    if (p.is_day_off) facts.push({ day: p.day, app: 'os', metric: 'days_off', value: 1, agg: 'sum' })
  }
  const num = (v: unknown) => (typeof v === 'number' ? v : null)
  for (const r of input.taskflowDaily ?? []) {
    for (const m of TASKFLOW_WEEK_METRICS) {
      if (!(m.column in r)) continue // a column the view doesn't have is not invented
      const v = num(r[m.column])
      facts.push({ day: r.day as Day, app: 'taskflow', metric: m.column, value: m.column === 'sleep_minutes' && v === 0 ? null : v, agg: m.agg })
    }
  }
  for (const r of input.moneyDaily ?? []) {
    for (const c of MONEY_WEEK_COLUMNS) if (c in r) facts.push({ day: r.day as Day, app: 'money', metric: c, value: num(r[c]), agg: 'sum' })
    if ('in_cents' in r && 'out_cents' in r) {
      const i = num(r.in_cents), o = num(r.out_cents)
      facts.push({ day: r.day as Day, app: 'money', metric: 'net_cents', value: i !== null && o !== null ? i - o : null, agg: 'sum' })
    }
  }
  const groups = new Map<string, { week_start: Day; app: string; metric: string; values: number[]; agg: 'sum' | 'avg' }>()
  for (const f of facts) {
    if (f.value === null) continue
    const week_start = weekStartOf(f.day, weekStartsOn)
    const k = `${week_start}|${f.app}|${f.metric}`
    const g = groups.get(k) ?? { week_start, app: f.app, metric: f.metric, values: [], agg: f.agg }
    g.values.push(f.value)
    groups.set(k, g)
  }
  return [...groups.values()]
    .map((g) => ({ user_id: userId, week_start: g.week_start, app: g.app, metric: g.metric,
      value: g.values.reduce((a, b) => a + b, 0) / (g.agg === 'avg' ? g.values.length : 1) }))
    .sort((a, b) => a.week_start.localeCompare(b.week_start) || a.app.localeCompare(b.app) || a.metric.localeCompare(b.metric))
}

/** The value of one metric in one week, or null when there is no row ("no data", never 0). */
export function weekValue(rows: WeekRow[], weekStart: Day, app: string, metric: string): number | null {
  return rows.find((r) => r.week_start === weekStart && r.app === app && r.metric === metric)?.value ?? null
}

export interface WeekDelta {
  app: string
  metric: string
  current: number | null
  previous: number | null
  /** current - previous; null unless both weeks have data. */
  delta: number | null
  /** delta as a percentage of previous; null unless both weeks have data and previous is not 0. */
  pct: number | null
}

/** This week vs last week for every (app, metric) that has data in either week. */
export function compareWeeks(rows: WeekRow[], windows: WindowPair): WeekDelta[] {
  const keys = new Map<string, { app: string; metric: string }>()
  for (const r of rows) if (r.week_start === windows.thisWeek || r.week_start === windows.lastWeek) keys.set(`${r.app}|${r.metric}`, { app: r.app, metric: r.metric })
  return [...keys.values()]
    .map(({ app, metric }) => {
      const current = weekValue(rows, windows.thisWeek, app, metric)
      const previous = weekValue(rows, windows.lastWeek, app, metric)
      const delta = current !== null && previous !== null ? current - previous : null
      return { app, metric, current, previous, delta, pct: delta !== null && previous !== 0 && previous !== null ? (delta / previous) * 100 : null }
    })
    .sort((a, b) => a.app.localeCompare(b.app) || a.metric.localeCompare(b.metric))
}
