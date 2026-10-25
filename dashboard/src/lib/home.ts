// What the Home screen shows (SPEC §3.1), computed from the rows the data layer loaded. Pure: no React, no fetching.
// Missing data is `null` (shown as "no data"), never 0 — except where the contract says a missing day is zero (a published
// app with no row for today did nothing today).
import { APPS } from './apps'
import type { NowRow, ProductiveDailyRow, StreakRow, TaskflowDeadlineRow, TaskflowGoalRow } from './contract'
import { currentGoals, type GoalView } from './goals'
import type { AppHealth } from './health'
import { goalRing, type GoalRing } from './pace'
import { productiveOn } from './productive'
import { addDays, diffDays, minutesIntoDay, todayToronto, type Day } from './time'

export type Row = Record<string, unknown>

export interface HomeInput {
  now: Date
  dailyGoalMinutes: number
  health: AppHealth[]
  appsNow: NowRow[]
  productive: ProductiveDailyRow[] | null
  streak: StreakRow[] | null
  /** taskflow_dashboard_days_off rows (null while not loaded / not published). */
  daysOff: { day: Day }[] | null
  /** taskflow_dashboard_daily rows, at least the last 8 days. */
  tfDaily: Row[] | null
  /** The first day TaskFlow has a row for (its whole history, not only the loaded window). Falls back to the earliest loaded row. */
  tfFirstDay?: Day | null
  tfNow: Row | null
  goals: TaskflowGoalRow[] | null
  deadlines: TaskflowDeadlineRow[] | null
  moneyNow: Row | null
  hiddenApps: string[]
}

export interface CounterPill {
  key: string
  label: string
  today: number
  /** Average per day over the up-to-7 days before today that are on or after TaskFlow's first row (a day with no row after that counts 0).
   *  Null when TaskFlow started today: there are no earlier days to average. */
  avg7: number | null
  /** The day limit from TaskFlow's at-most goal with this counter_key; null when none or the column isn't published yet. */
  limit: number | null
  tone: 'none' | 'ok' | 'amber' | 'red'
}

export interface AttentionItem {
  id: string
  appKey: string
  label: string
  /** null for items that are a state, not a count ("Weekly review due"). */
  count: number | null
  /** Path inside the app (TaskFlow's documented deep links, else its home). */
  path: string
}

export type DeadlineTone = 'none' | 'amber' | 'red'
export interface DeadlineItem { id: string; title: string; tag: string | null; dueOn: Day; daysLeft: number; text: string; tone: DeadlineTone }

export interface MoneyCard {
  inCents: number | null
  outCents: number | null
  netCents: number | null
  subscriptionsCents: number | null
  toCategorise: number | null
  toCategoriseLabel: string
}

export interface AppTile {
  dataKey: string
  name: string
  state: AppHealth['state']
  statusLine: string | null
  lastActivityAt: string | null
  stale: boolean
}

export interface HomeModel {
  today: Day
  anyPublished: boolean
  isDayOff: boolean
  header: {
    ring: GoalRing
    streak: { current: number; longest: number } | null
    workMinutes: number | null
    /** The night that ended this morning (TaskFlow `sleep_minutes`); null when there is none. */
    sleepMinutes: number | null
    counters: CounterPill[]
  }
  goals: { daily: GoalView[]; longer: GoalView[] }
  attention: AttentionItem[]
  deadlines: DeadlineItem[]
  money: MoneyCard | null
  tiles: AppTile[]
}

export const COUNTERS: readonly { key: string; label: string }[] = [
  { key: 'cigarettes', label: 'Cig' },
  { key: 'weed', label: 'Weed' },
]

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const isReadable = (h: AppHealth | undefined) => !!h && (h.state === 'ok' || h.state === 'needs-rerun')

export function formatCents(cents: number, signed = false): string {
  const dollars = Math.round(Math.abs(cents) / 100)
  const body = `$${dollars.toLocaleString('en-CA')}`
  return cents < 0 ? `-${body}` : signed && cents > 0 ? `+${body}` : body
}

function counters(tfDaily: Row[], goals: TaskflowGoalRow[], today: Day, firstDay: Day | null): CounterPill[] {
  const day = (r: Row) => r.day as Day
  const out: CounterPill[] = []
  for (const c of COUNTERS) {
    if (!tfDaily.some((r) => c.key in r)) continue // the view doesn't have this counter
    const at = (d: Day) => num(tfDaily.find((r) => day(r) === d)?.[c.key]) ?? 0
    const first = firstDay ?? tfDaily.map(day).sort()[0] ?? today
    let sum = 0, counted = 0
    for (let n = 1; n <= 7; n++) {
      const d = addDays(today, -n)
      if (d < first) break // before I started using TaskFlow: not zero, just not there
      sum += at(d); counted++
    }
    const goal = currentGoals(goals, today).find((g) => g.counterKey === c.key && g.direction === 'at_most' && g.period === 'day' && !g.paused)
    out.push({
      key: c.key, label: c.label, today: at(today), avg7: counted > 0 ? Math.round((sum / counted) * 10) / 10 : null,
      limit: goal ? goal.amount : null,
      tone: !goal ? 'none' : goal.state === 'over' ? 'red' : goal.state === 'warning' ? 'amber' : 'ok',
    })
  }
  return out
}

function attention(i: HomeInput): AttentionItem[] {
  const items: AttentionItem[] = []
  const tfHealth = i.health.find((h) => h.dataKey === 'taskflow')
  const hidden = new Set(i.hiddenApps)
  if (!hidden.has('taskflow') && isReadable(tfHealth) && i.tfNow?.review_due === true) {
    items.push({ id: 'taskflow-review', appKey: 'taskflow', label: 'Weekly review due', count: null, path: '/review' })
  }
  const counted: AttentionItem[] = []
  for (const h of i.health) {
    if (hidden.has(h.dataKey) || !isReadable(h)) continue
    const row = i.appsNow.find((r) => r.app === h.dataKey)
    const total = row?.needs_attention ?? 0
    if (h.dataKey === 'taskflow') {
      const overdue = num(i.tfNow?.overdue_tasks)
      const cold = num(i.tfNow?.cold_projects) ?? 0
      if (overdue !== null) {
        if (overdue > 0) counted.push({ id: 'taskflow-overdue', appKey: 'taskflow', label: 'overdue tasks', count: overdue, path: '/tasks?view=today' })
        if (total - overdue > 0) counted.push({ id: 'taskflow-shifts', appKey: 'taskflow', label: 'unchecked shifts', count: total - overdue, path: '/work' })
      } else if (total > 0) {
        counted.push({ id: 'taskflow-attention', appKey: 'taskflow', label: row?.attention_label ?? 'items waiting', count: total, path: '/tasks?view=today' })
      }
      if (cold > 0) counted.push({ id: 'taskflow-cold', appKey: 'taskflow', label: 'cold projects', count: cold, path: '/' })
    } else if (total > 0) {
      counted.push({ id: `${h.dataKey}-attention`, appKey: h.dataKey, label: row?.attention_label ?? 'items waiting', count: total, path: '/' })
    }
  }
  counted.sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
  return [...items, ...counted]
}

function deadlines(rows: TaskflowDeadlineRow[], today: Day): DeadlineItem[] {
  return rows
    .filter((r) => r.hard_deadline)
    .map((r) => {
      const daysLeft = diffDays(today, r.due_on) // recomputed in Toronto time, not the view's own days_left
      const text = daysLeft < 0 ? `${-daysLeft} d overdue` : daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `${daysLeft} days`
      const tone: DeadlineTone = daysLeft <= 2 ? 'red' : daysLeft <= 7 ? 'amber' : 'none'
      return { id: r.task_id, title: r.title, tag: r.tag, dueOn: r.due_on, daysLeft, text, tone }
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.title.localeCompare(b.title))
}

export function buildHome(i: HomeInput): HomeModel {
  const today = todayToronto(i.now)
  const anyPublished = i.health.some(isReadable)
  const hidden = new Set(i.hiddenApps)
  const prodToday = i.productive?.find((p) => p.day === today)
  const isDayOff = !!prodToday?.is_day_off || !!i.daysOff?.some((d) => d.day === today)

  const minutes = anyPublished && i.productive ? productiveOn(i.productive, today) : null
  const st = i.streak?.[0]
  const tfToday = i.tfDaily?.find((r) => r.day === today)
  const sleep = num(tfToday?.sleep_minutes)
  const work = i.tfDaily && i.tfDaily.some((r) => 'work_minutes' in r) ? (num(tfToday?.work_minutes) ?? 0) : null

  const goalViews = i.goals ? currentGoals(i.goals, today).filter((g) => !g.paused) : []
  const moneyHealth = i.health.find((h) => h.dataKey === 'money')
  const moneyRow = i.appsNow.find((r) => r.app === 'money')

  return {
    today, anyPublished, isDayOff,
    header: {
      ring: goalRing({ minutes, goalMinutes: i.dailyGoalMinutes, minutesIntoDay: minutesIntoDay(i.now), isDayOff }),
      streak: st ? { current: st.current, longest: st.longest } : null,
      workMinutes: work,
      sleepMinutes: sleep !== null && sleep > 0 ? sleep : null,
      counters: i.tfDaily ? counters(i.tfDaily, i.goals ?? [], today, i.tfFirstDay ?? null) : [],
    },
    goals: { daily: goalViews.filter((g) => g.period === 'day'), longer: goalViews.filter((g) => g.period !== 'day') },
    attention: attention(i),
    deadlines: i.deadlines && !hidden.has('taskflow') ? deadlines(i.deadlines, today) : [],
    money: isReadable(moneyHealth) && !hidden.has('money') && i.moneyNow
      ? {
          inCents: num(i.moneyNow.month_in_cents), outCents: num(i.moneyNow.month_out_cents), netCents: num(i.moneyNow.month_net_cents),
          subscriptionsCents: num(i.moneyNow.subscriptions_monthly_cents), toCategorise: moneyRow?.needs_attention ?? null,
          toCategoriseLabel: moneyRow?.attention_label ?? 'to categorise / review',
        }
      : null,
    tiles: APPS.filter((a) => !hidden.has(a.dataKey)).map((a) => {
      const h = i.health.find((x) => x.dataKey === a.dataKey)
      const row = i.appsNow.find((r) => r.app === a.dataKey)
      return {
        dataKey: a.dataKey, name: a.name, state: h?.state ?? 'not-published',
        statusLine: row?.status_line ?? null, lastActivityAt: h?.lastActivityAt ?? row?.last_activity_at ?? null, stale: h?.stale ?? false,
      }
    }),
  }
}

/** Which dashboard views Home may read for an app, given its health: only published, valid apps are read. */
export function readableApps(health: AppHealth[]): Set<string> {
  return new Set(health.filter(isReadable).map((h) => h.dataKey))
}
