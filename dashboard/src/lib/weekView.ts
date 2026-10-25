// What the Week screen shows (SPEC §3.2): this week vs last week per app, productive time by tag, weekly goals, and the
// daily stacked bars. Pure; numbers come from os_week / os_tag_daily / os_productive_daily / TaskFlow's goals.
import type { ProductiveDailyRow, TagDailyRow, TaskflowGoalRow, WeekRow } from './contract'
import { goalHistory, goalView, type GoalView } from './goals'
import { formatCents } from './home'
import { PRODUCTIVE_KINDS } from './productive'
import { addDays, formatDuration, type Day } from './time'
import { compareWeeks, type WindowPair } from './week'

export type MetricFormat = 'minutes' | 'count' | 'decimal' | 'cents'
export interface MetricSpec {
  app: string
  metric: string
  label: string
  group: string
  format: MetricFormat
  /** Lower is better: a rise is shown as worse (amber), a fall as better. Everything else is neutral. */
  lowerBetter?: boolean
}

/** Display order and labels. Only cigarettes, weed, missed tasks and missed deadlines are lower-is-better. */
export const WEEK_METRICS: readonly MetricSpec[] = [
  { app: 'os', metric: 'productive_minutes', label: 'Productive time', group: 'Productive', format: 'minutes' },
  { app: 'os', metric: 'days_off', label: 'Days off', group: 'Productive', format: 'count' },
  { app: 'taskflow', metric: 'work_minutes', label: 'Work', group: 'TaskFlow', format: 'minutes' },
  { app: 'taskflow', metric: 'commute_minutes', label: 'Commute', group: 'TaskFlow', format: 'minutes' },
  { app: 'taskflow', metric: 'sleep_minutes', label: 'Average sleep', group: 'TaskFlow', format: 'minutes' },
  { app: 'taskflow', metric: 'mood', label: 'Mood (average)', group: 'TaskFlow', format: 'decimal' },
  { app: 'taskflow', metric: 'energy', label: 'Energy (average)', group: 'TaskFlow', format: 'decimal' },
  { app: 'taskflow', metric: 'cigarettes', label: 'Cigarettes', group: 'TaskFlow', format: 'count', lowerBetter: true },
  { app: 'taskflow', metric: 'weed', label: 'Weed', group: 'TaskFlow', format: 'count', lowerBetter: true },
  { app: 'taskflow', metric: 'items_done', label: 'Tasks done', group: 'TaskFlow', format: 'count' },
  { app: 'taskflow', metric: 'tasks_missed', label: 'Tasks missed', group: 'TaskFlow', format: 'count', lowerBetter: true },
  { app: 'taskflow', metric: 'deadlines_missed', label: 'Deadlines missed', group: 'TaskFlow', format: 'count', lowerBetter: true },
  { app: 'dsa', metric: 'items_done', label: 'DSA items', group: 'InteractiveDSA', format: 'count' },
  { app: 'dsa', metric: 'active_minutes', label: 'DSA time', group: 'InteractiveDSA', format: 'minutes' },
  { app: 'trading', metric: 'items_done', label: 'Charts studied', group: 'Chart Journal', format: 'count' },
  { app: 'trading', metric: 'active_minutes', label: 'Chart time', group: 'Chart Journal', format: 'minutes' },
  { app: 'money', metric: 'in_cents', label: 'Money in', group: 'Money', format: 'cents' },
  { app: 'money', metric: 'out_cents', label: 'Money out', group: 'Money', format: 'cents' },
  { app: 'money', metric: 'net_cents', label: 'Net', group: 'Money', format: 'cents' },
]

export function formatMetric(format: MetricFormat, v: number | null, signed = false): string {
  if (v === null) return 'No data'
  const sign = signed && v > 0 ? '+' : ''
  switch (format) {
    case 'minutes': return v < 0 ? `-${formatDuration(-v)}` : `${sign}${formatDuration(v)}`
    case 'cents': return formatCents(v, signed)
    case 'decimal': return `${sign}${Math.round(v * 10) / 10}`
    default: return `${sign}${Math.round(v * 10) / 10}`
  }
}

export type Tone = 'better' | 'worse' | 'neutral'
export interface ComparisonRow {
  spec: MetricSpec
  current: number | null
  previous: number | null
  delta: number | null
  pct: number | null
  /** Written out so colour is never the only signal: "Up 12%", "Down 3", "No change", "No data". */
  changeText: string
  tone: Tone
}

function changeText(spec: MetricSpec, delta: number | null, pct: number | null, current: number | null, previous: number | null): string {
  if (current === null && previous === null) return 'No data'
  if (delta === null) return current === null ? 'No data this week' : 'No data last week'
  if (delta === 0) return 'No change'
  const amount = formatMetric(spec.format, Math.abs(delta))
  return `${delta > 0 ? 'Up' : 'Down'} ${amount}${pct !== null ? ` (${Math.round(Math.abs(pct))}%)` : ''}`
}

/** Every catalogued metric that has data in either week, in display order. Missing is null / "No data", never 0. */
export function weekComparison(osWeek: WeekRow[], windows: WindowPair): ComparisonRow[] {
  const deltas = new Map(compareWeeks(osWeek, windows).map((d) => [`${d.app}|${d.metric}`, d]))
  const rows: ComparisonRow[] = []
  for (const spec of WEEK_METRICS) {
    const d = deltas.get(`${spec.app}|${spec.metric}`)
    if (!d) continue
    const tone: Tone = !spec.lowerBetter || d.delta === null || d.delta === 0 ? 'neutral' : d.delta > 0 ? 'worse' : 'better'
    rows.push({ spec, current: d.current, previous: d.previous, delta: d.delta, pct: d.pct, changeText: changeText(spec, d.delta, d.pct, d.current, d.previous), tone })
  }
  return rows
}

export interface TagSplitRow { tagPath: string; parent: string; current: number; previous: number; delta: number }

/** Productive minutes by tag, this week vs last (the max-rule is already applied in os_tag_daily). Biggest this week first. */
export function tagSplit(tags: TagDailyRow[], windows: WindowPair): TagSplitRow[] {
  const acc = new Map<string, TagSplitRow>()
  for (const t of tags) {
    if (!PRODUCTIVE_KINDS.includes(t.kind)) continue
    const inThis = t.day >= windows.thisWeek && t.day <= addDays(windows.thisWeek, 6)
    const inLast = t.day >= windows.lastWeek && t.day <= addDays(windows.lastWeek, 6)
    if (!inThis && !inLast) continue
    const r = acc.get(t.tag_path) ?? { tagPath: t.tag_path, parent: t.parent_tag, current: 0, previous: 0, delta: 0 }
    if (inThis) r.current += t.minutes; else r.previous += t.minutes
    acc.set(t.tag_path, r)
  }
  return [...acc.values()].map((r) => ({ ...r, delta: r.current - r.previous })).sort((a, b) => b.current - a.current || b.previous - a.previous || a.tagPath.localeCompare(b.tagPath))
}

export interface DayBar { day: Day; isDayOff: boolean; total: number; parts: Record<string, number> }

/** Seven stacked bars for the week starting `weekStart`: productive minutes per parent tag; days off flagged (greyed in the chart). */
export function dayBars(tags: TagDailyRow[], productive: ProductiveDailyRow[], weekStart: Day): { bars: DayBar[]; series: string[] } {
  const bars: DayBar[] = Array.from({ length: 7 }, (_, k) => {
    const day = addDays(weekStart, k)
    return { day, isDayOff: !!productive.find((p) => p.day === day)?.is_day_off, total: 0, parts: {} }
  })
  const totals = new Map<string, number>()
  for (const t of tags) {
    if (!PRODUCTIVE_KINDS.includes(t.kind)) continue
    const bar = bars.find((b) => b.day === t.day)
    if (!bar) continue
    bar.parts[t.parent_tag] = (bar.parts[t.parent_tag] ?? 0) + t.minutes
    bar.total += t.minutes
    totals.set(t.parent_tag, (totals.get(t.parent_tag) ?? 0) + t.minutes)
  }
  return { bars, series: [...totals.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([n]) => n) }
}

export interface WeeklyGoal { id: string; name: string; current: GoalView; last: GoalView | null }

/**
 * TaskFlow's weekly goals: this period's progress, and how the previous finished period ended (hit / missed). Periods come from the
 * rows (TaskFlow's own week, whatever its start day is); Home never judges a goal itself.
 */
export function weeklyGoals(rows: TaskflowGoalRow[], today: Day): WeeklyGoal[] {
  const out: WeeklyGoal[] = []
  for (const g of rows) {
    if (g.period !== 'week' || g.paused || !(g.period_start <= today && today <= g.period_end)) continue
    const history = goalHistory(rows, g.goal_id, today).filter((v) => v.periodEnd < g.period_start)
    out.push({ id: g.goal_id, name: g.name, current: goalView(g, today), last: history.at(-1) ?? null })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name))
}
