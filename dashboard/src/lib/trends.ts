// Range windows, bucketing and statistics for Trends (SPEC §3.3). Pure: the screens read only the date range they show
// (`rangeWindow` says how far back each view must be asked for) and these functions turn those rows into chart data.
import type { MoneyMonthlyRow, ProductiveDailyRow, TagDailyRow, WeekRow } from './contract'
import { PRODUCTIVE_KINDS } from './productive'
import { addDays, addMonths, diffDays, weekdayIndex, type Day } from './time'
import { weekStartOf } from './week'

export type Range = '14d' | '30d' | '90d' | '12m'
export const RANGES: readonly { id: Range; label: string }[] = [
  { id: '14d', label: '14 days' }, { id: '30d', label: '30 days' }, { id: '90d', label: '90 days' }, { id: '12m', label: '12 months' },
]
export const DEFAULT_RANGE: Range = '30d'
export const parseRange = (s: string | null): Range => (RANGES.some((r) => r.id === s) ? (s as Range) : DEFAULT_RANGE)

export type Granularity = 'day' | 'week' | 'month'

export interface RangeWindow {
  range: Range
  today: Day
  /** First day the charts show. */
  shownStart: Day
  /** Bucket size of the range-wide charts: day, day, week, month. */
  granularity: Granularity
  /** How far back to ask `os_tag_daily` / `os_productive_daily`: the first bucket's start (and a full year for the 12-month heatmap). */
  osStart: Day
  /** How far back to ask `os_week`: the start of the week containing `shownStart`. */
  weekStart: Day
  /** How far back to ask `taskflow_dashboard_daily`: `osStart` minus 6 days, so a 7-day trailing average has its earlier days. */
  tfStart: Day
  /** First day of the heatmap: the whole shown range, a full 365 days for 12 months. */
  heatStart: Day
  /** First month shown by month charts: the month containing `shownStart`. */
  monthStart: Day
}

const DAYS: Record<Exclude<Range, '12m'>, number> = { '14d': 14, '30d': 30, '90d': 90 }

export function rangeWindow(range: Range, today: Day, weekStartsOn = 1): RangeWindow {
  const min = (a: Day, b: Day) => (a < b ? a : b)
  const shownStart = range === '12m' ? addMonths(today, -11) : addDays(today, -(DAYS[range] - 1))
  const monthStart = `${shownStart.slice(0, 7)}-01` // month charts show the months the range touches
  const granularity: Granularity = range === '90d' ? 'week' : range === '12m' ? 'month' : 'day'
  const heatStart = range === '12m' ? addDays(today, -364) : shownStart
  // The 30-day average is over the 30 days before today, so the 30-day range needs one day more than it shows (the charts ignore it).
  const osStart = granularity === 'week' ? weekStartOf(shownStart, weekStartsOn) : min(range === '30d' ? addDays(today, -30) : shownStart, heatStart)
  return { range, today, shownStart, granularity, osStart, weekStart: weekStartOf(shownStart, weekStartsOn), tfStart: addDays(osStart, -6), heatStart, monthStart }
}

// ── buckets ───────────────────────────────────────────────────────────────────────────────────────────────────────
export interface Bucket { key: Day; label: string; start: Day; end: Day }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** `Oct 25` */
export function shortDay(day: Day): string {
  return `${MONTHS[Number(day.slice(5, 7)) - 1]} ${Number(day.slice(8, 10))}`
}

export function bucketKey(day: Day, g: Granularity, weekStartsOn = 1): Day {
  return g === 'day' ? day : g === 'week' ? weekStartOf(day, weekStartsOn) : `${day.slice(0, 7)}-01`
}

/** Contiguous buckets covering `from`..`to`. A week or month bucket may start before `from` (it is the whole week/month). */
export function makeBuckets(from: Day, to: Day, g: Granularity, weekStartsOn = 1): Bucket[] {
  const out: Bucket[] = []
  let key = bucketKey(from, g, weekStartsOn)
  while (key <= to) {
    const next = g === 'day' ? addDays(key, 1) : g === 'week' ? addDays(key, 7) : addMonths(key, 1)
    out.push({ key, label: g === 'month' ? MONTHS[Number(key.slice(5, 7)) - 1]! : shortDay(key), start: key, end: addDays(next, -1) })
    key = next
  }
  return out
}

// ── productive time by tag ───────────────────────────────────────────────────────────────────────────────────────
export interface StackedData { series: string[]; rows: ({ key: Day; label: string; total: number } & Record<string, number | string>)[] }

/** Productive (study + hustle) minutes per bucket, one series per parent tag (or per full tag path with `level: 'sub'`), biggest series first. */
export function stackedProductive(tags: TagDailyRow[], buckets: Bucket[], g: Granularity, weekStartsOn = 1, level: 'parent' | 'sub' = 'parent'): StackedData {
  const byBucket = new Map<Day, Map<string, number>>(buckets.map((b) => [b.key, new Map()]))
  const totals = new Map<string, number>()
  for (const t of tags) {
    if (!PRODUCTIVE_KINDS.includes(t.kind)) continue
    const m = byBucket.get(bucketKey(t.day, g, weekStartsOn))
    if (!m) continue
    const name = level === 'parent' ? t.parent_tag : t.tag_path
    m.set(name, (m.get(name) ?? 0) + t.minutes)
    totals.set(name, (totals.get(name) ?? 0) + t.minutes)
  }
  const series = [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n)
  return {
    series,
    rows: buckets.map((b) => {
      const m = byBucket.get(b.key)!
      const row: Record<string, number | string> = { key: b.key, label: b.label, total: [...m.values()].reduce((x, y) => x + y, 0) }
      for (const s of series) row[s] = m.get(s) ?? 0
      return row as StackedData['rows'][number]
    }),
  }
}

// ── consistency heatmap ──────────────────────────────────────────────────────────────────────────────────────────
/** none = before the first productive day (not a miss); 0 = nothing; 1 = under half the goal; 2 = under the goal; 3 = goal reached. */
export type HeatLevel = 'none' | 'off' | 0 | 1 | 2 | 3
export interface HeatCell { day: Day; minutes: number; level: HeatLevel }

export function heatLevel(minutes: number, goal: number, isDayOff: boolean, beforeStart: boolean): HeatLevel {
  if (isDayOff) return 'off'
  if (beforeStart) return 'none'
  if (minutes <= 0) return 0
  return minutes < goal * 0.5 ? 1 : minutes < goal ? 2 : 3
}

/** One cell per day from `from` to `to`. A missing row is a day with nothing, except before `firstDay` (when I hadn't started). */
export function heatmap(productive: ProductiveDailyRow[], from: Day, to: Day, goal: number, firstDay: Day | null): HeatCell[] {
  const by = new Map(productive.map((p) => [p.day, p]))
  const cells: HeatCell[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const p = by.get(d)
    const minutes = p?.minutes ?? 0
    cells.push({ day: d, minutes, level: heatLevel(minutes, goal, !!p?.is_day_off, firstDay === null || d < firstDay) })
  }
  return cells
}

/** Cells as columns of weeks (row 0 = the week's first day). Padding cells are null. */
export function heatGrid(cells: HeatCell[], weekStartsOn = 1): (HeatCell | null)[][] {
  const cols: (HeatCell | null)[][] = []
  for (const c of cells) {
    const row = (weekdayIndex(c.day) - weekStartsOn + 7) % 7
    if (row === 0 || cols.length === 0) cols.push(Array(7).fill(null))
    cols[cols.length - 1]![row] = c
  }
  return cols
}

// ── stats ────────────────────────────────────────────────────────────────────────────────────────────────────────
export interface TrendStats {
  avg7: number | null
  avg30: number | null
  bestDay: { day: Day; minutes: number } | null
  bestWeek: { weekStart: Day; minutes: number } | null
  /** All-time, from os_streak. */
  longestStreak: number | null
}

/**
 * Average productive minutes per day over the (up to) N days before today: days off are left out, a day with no row counts 0,
 * and days before `firstDay` (before I started) or before `windowStart` (not loaded) are not counted. Null when the loaded
 * window doesn't reach back N days (30 days on the 14-day range) or nothing is left to average.
 */
export function averageProductive(rows: ProductiveDailyRow[], n: number, today: Day, windowStart: Day, firstDay: Day | null): number | null {
  if (windowStart > addDays(today, -n)) return null
  const by = new Map(rows.map((r) => [r.day, r]))
  let sum = 0, counted = 0
  for (let k = 1; k <= n; k++) {
    const d = addDays(today, -k)
    if (firstDay === null || d < firstDay) continue
    const r = by.get(d)
    if (r?.is_day_off) continue
    sum += r?.minutes ?? 0; counted++
  }
  return counted > 0 ? Math.round(sum / counted) : null
}

export function trendStats(rows: ProductiveDailyRow[], today: Day, weekStartsOn: number, windowStart: Day, firstDay: Day | null, longestStreak: number | null): TrendStats {
  let bestDay: TrendStats['bestDay'] = null
  for (const r of rows) if (r.day >= windowStart && r.day <= today && r.minutes > 0 && (!bestDay || r.minutes > bestDay.minutes || (r.minutes === bestDay.minutes && r.day < bestDay.day))) bestDay = { day: r.day, minutes: r.minutes }
  // Best week: whole weeks inside the loaded window that are over (a week still running can't be compared).
  const weeks = new Map<Day, number>()
  for (const r of rows) {
    if (r.day < windowStart || r.day > today) continue
    const w = weekStartOf(r.day, weekStartsOn)
    weeks.set(w, (weeks.get(w) ?? 0) + r.minutes)
  }
  let bestWeek: TrendStats['bestWeek'] = null
  for (const [w, minutes] of weeks) {
    if (w < windowStart || addDays(w, 6) >= today || minutes <= 0) continue
    if (!bestWeek || minutes > bestWeek.minutes || (minutes === bestWeek.minutes && w < bestWeek.weekStart)) bestWeek = { weekStart: w, minutes }
  }
  return { avg7: averageProductive(rows, 7, today, windowStart, firstDay), avg30: averageProductive(rows, 30, today, windowStart, firstDay), bestDay, bestWeek, longestStreak }
}

// ── TaskFlow daily extras: balance and counters ──────────────────────────────────────────────────────────────────
type Row = Record<string, unknown>
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export const BALANCE_SERIES = [
  { key: 'wellness', label: 'Wellness' }, { key: 'break', label: 'Break' }, { key: 'sleep', label: 'Sleep' }, { key: 'rest', label: 'Nap + reset' },
] as const
export type BalanceKey = (typeof BALANCE_SERIES)[number]['key']
export type BalanceRow = { key: Day; label: string } & Record<BalanceKey, number | null>

function balanceOf(r: Row): Record<BalanceKey, number | null> {
  const nap = num(r.nap_minutes), reset = num(r.reset_minutes)
  const sleep = num(r.sleep_minutes)
  return { wellness: num(r.wellness_minutes), break: num(r.break_minutes), sleep: sleep !== null && sleep > 0 ? sleep : null, rest: nap === null && reset === null ? null : (nap ?? 0) + (reset ?? 0) }
}

/** Minutes per day for each balance series, averaged over the days in the bucket that have a value (so a day is itself at day size). Null: no day had one. */
export function balanceSeries(tfDaily: Row[], buckets: Bucket[], g: Granularity, weekStartsOn = 1): BalanceRow[] {
  const acc = new Map<Day, Record<BalanceKey, number[]>>(buckets.map((b) => [b.key, { wellness: [], break: [], sleep: [], rest: [] }]))
  for (const r of tfDaily) {
    const a = acc.get(bucketKey(String(r.day), g, weekStartsOn))
    if (!a) continue
    const b = balanceOf(r)
    for (const k of Object.keys(b) as BalanceKey[]) if (b[k] !== null) a[k].push(b[k]!)
  }
  const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((x, y) => x + y, 0) / xs.length) : null)
  return buckets.map((bk) => ({ key: bk.key, label: bk.label, wellness: mean(acc.get(bk.key)!.wellness), break: mean(acc.get(bk.key)!.break), sleep: mean(acc.get(bk.key)!.sleep), rest: mean(acc.get(bk.key)!.rest) }))
}

export type CounterPoint = { key: Day; label: string; value: number | null; avg7: number | null }

/**
 * A counter per bucket. Per day: the count (0 on a day with no row once TaskFlow has started; null before `firstDay`) and the trailing
 * average of up to 7 days ending that day. Per week or month: the average per day over the days in it since `firstDay`.
 */
export function counterSeries(tfDaily: Row[], column: string, buckets: Bucket[], g: Granularity, firstDay: Day | null): CounterPoint[] {
  const by = new Map(tfDaily.map((r) => [String(r.day), num(r[column])]))
  const at = (d: Day): number | null => (firstDay === null || d < firstDay ? null : (by.get(d) ?? 0))
  return buckets.map((b) => {
    if (g === 'day') {
      let sum = 0, n = 0
      for (let k = 0; k < 7; k++) { const v = at(addDays(b.key, -k)); if (v !== null) { sum += v; n++ } }
      return { key: b.key, label: b.label, value: at(b.key), avg7: n ? Math.round((sum / n) * 10) / 10 : null }
    }
    let sum = 0, n = 0
    for (let d = b.start; d <= b.end; d = addDays(d, 1)) { const v = at(d); if (v !== null) { sum += v; n++ } }
    return { key: b.key, label: b.label, value: n ? Math.round((sum / n) * 10) / 10 : null, avg7: null }
  })
}

// ── weekly series from os_week, and money ────────────────────────────────────────────────────────────────────────
export interface WeeklySpec { key: string; app: string; metric: string; label: string }
export type WeeklyRow = { key: Day; label: string } & Record<string, number | string | null>

/** One row per week start from `from` to `to`, one value per spec (null when the week has no row for it). */
export function weeklySeries(osWeek: WeekRow[], from: Day, to: Day, specs: readonly WeeklySpec[], weekStartsOn = 1): WeeklyRow[] {
  const by = new Map(osWeek.map((r) => [`${r.week_start}|${r.app}|${r.metric}`, r.value]))
  return makeBuckets(from, to, 'week', weekStartsOn).map((b) => {
    const row: WeeklyRow = { key: b.key, label: b.label }
    for (const s of specs) row[s.key] = by.get(`${b.key}|${s.app}|${s.metric}`) ?? null
    return row
  })
}

export type MoneyPoint = { key: Day; label: string; in: number; out: number; net: number; essential: number; discretionary: number }
/** Money per month in dollars (the view is in cents), oldest first, from `from` on. */
export function moneySeries(monthly: MoneyMonthlyRow[], from: Day): MoneyPoint[] {
  return monthly.filter((r) => r.month >= from).sort((a, b) => a.month.localeCompare(b.month)).map((r) => ({
    key: r.month, label: MONTHS[Number(r.month.slice(5, 7)) - 1]!, in: r.in_cents / 100, out: r.out_cents / 100, net: r.net_cents / 100,
    essential: r.essential_cents / 100, discretionary: r.discretionary_cents / 100,
  }))
}

/** Days between two days, inclusive — for "n days shown". */
export const spanDays = (from: Day, to: Day) => diffDays(from, to) + 1
