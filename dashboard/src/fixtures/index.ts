// Sample data for sample-data mode (SPEC §1): rows shaped exactly like the contract views, relative to "today" so the
// screens always look current. Dev only — nothing here is imported by a production build (see data/sample.ts).
import type { DailyRow, HealthRow, NowRow, TaskflowAreaDailyRow, TaskflowDaysOffRow, TaskflowDeadlineRow, TaskflowGoalRow, MoneyMonthlyRow, OsViewRows, Extra } from '../lib/contract'
import { addDays, torontoMidnight, type Day } from '../lib/time'

export const SAMPLE_USER = '00000000-0000-4000-8000-000000000001'
export const SAMPLE_DAYS = 14

type Daily = DailyRow & Extra
type Now = NowRow & Extra

export interface SampleViews {
  trading_dashboard_daily: Daily[]
  trading_dashboard_now: Now[]
  taskflow_dashboard_daily: Daily[]
  taskflow_dashboard_now: Now[]
  taskflow_dashboard_area_daily: TaskflowAreaDailyRow[]
  taskflow_dashboard_days_off: TaskflowDaysOffRow[]
  taskflow_dashboard_deadlines: TaskflowDeadlineRow[]
  taskflow_dashboard_goals: TaskflowGoalRow[]
  dsa_dashboard_daily: Daily[]
  dsa_dashboard_now: Now[]
  money_dashboard_daily: Daily[]
  money_dashboard_now: Now[]
  money_dashboard_monthly: MoneyMonthlyRow[]
}

const iso = (day: Day, hhmm: string) => `${day}T${hhmm}:00-04:00`
/** Midnight-ish instant of a day offset, for "N days ago" style timestamps. */
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000).toISOString()

function daily(app: string, day: Day, updatedAt: string, f: Omit<DailyRow, 'user_id' | 'day' | 'app' | 'updated_at'>, extra: Extra): Daily {
  return { user_id: SAMPLE_USER, day, app, ...f, updated_at: updatedAt, ...extra }
}
function now(app: string, updatedAt: string, f: Omit<NowRow, 'user_id' | 'app' | 'updated_at'>, extra: Extra): Now {
  return { user_id: SAMPLE_USER, app, ...f, updated_at: updatedAt, ...extra }
}

/** `today` is a Toronto day; `at` is the real current instant (for updated_at columns). */
export function buildSampleViews(today: Day, at: Date = torontoMidnight(today)): SampleViews {
  const days = Array.from({ length: SAMPLE_DAYS }, (_, i) => addDays(today, i - (SAMPLE_DAYS - 1))) // oldest .. today
  const dayOff = days[5]!
  const stamp = (d: Day) => iso(d, '21:30')
  const upd = at.toISOString()

  // Chart Journal ("trading"): study minutes, streak resets once.
  const tradingMinutes = [35, 40, 0, 45, 50, 30, 0, 55, 60, 40, 45, 50, 35, 25]
  let tStreak = 0
  const trading_dashboard_daily = days.flatMap((d, i) => {
    const m = tradingMinutes[i]!
    tStreak = m > 0 ? tStreak + 1 : 0
    if (m === 0) return []
    const charts = Math.max(1, Math.round(m / 12))
    return [daily('trading', d, stamp(d), { active_minutes: m, items_done: charts, items_planned: 6, streak_current: tStreak, headline: `${charts} charts · 1 journal` },
      { journal_entries: 1, trades_opened: i === 8 ? 1 : 0, trades_closed: i === 11 ? 1 : 0 })]
  })

  // TaskFlow
  const tfStudy = [60, 75, 50, 0, 90, 0, 40, 65, 80, 55, 70, 85, 60, 35]
  const tfHustle = [30, 0, 45, 0, 0, 0, 60, 30, 0, 45, 20, 0, 40, 0]
  const tfWork = [0, 450, 480, 0, 450, 0, 0, 450, 480, 450, 0, 480, 450, 0]
  const tfSleep = [440, 470, 410, 500, 455, 480, 430, 465, 420, 450, 475, 445, 460, 430]
  let fStreak = 0
  const taskflow_dashboard_daily = days.map((d, i) => {
    const productive = tfStudy[i]! + tfHustle[i]!
    const off = d === dayOff
    if (productive > 0) fStreak += 1
    else if (!off) fStreak = 0
    return daily('taskflow', d, stamp(d),
      { active_minutes: productive, items_done: 2 + (i % 3), items_planned: 4, streak_current: fStreak, headline: `${Math.floor(productive / 60)}h ${productive % 60}m productive · ${2 + (i % 3)} done` },
      { work_minutes: tfWork[i]!, commute_minutes: tfWork[i]! > 0 ? 60 : 0, work_unverified_shifts: i === 1 ? 1 : 0, study_minutes: tfStudy[i]!, hustle_minutes: tfHustle[i]!,
        wellness_minutes: 30, break_minutes: 40, nap_minutes: i % 4 === 0 ? 25 : 0, reset_minutes: i % 4 === 0 ? 10 : 0, sleep_minutes: tfSleep[i]!, personal_minutes: 90,
        tasks_missed: i % 5 === 0 ? 1 : 0, deadlines_missed: 0, cigarettes: [3, 5, 2, 4, 6, 1, 3, 4, 2, 5, 3, 4, 2, 3][i]!, weed: i % 3 === 0 ? 1 : 0,
        is_day_off: off, activities_done: 1 + (i % 2), goals_hit: 2 + (i % 2), goals_total: 4, mood: 3 + (i % 3), energy: 2 + (i % 4) })
  })
  const taskflow_dashboard_now = [now('taskflow', upd,
    { contract_version: 1, status_line: '3 left today · 2 overdue · DSA 25m', needs_attention: 3, attention_label: 'overdue tasks / unchecked shifts', last_activity_at: hoursAgo(at, 1) },
    { open_tasks: 14, overdue_tasks: 2, inbox_count: 4, running_area: 'Study/DSA', running_since: hoursAgo(at, 0.4), reset_running_since: null, on_shift_since: null, cold_projects: 1 })]

  const area = (d: Day, parent: string, tag: string, kind: string, appKey: string | null, minutes: number): TaskflowAreaDailyRow =>
    ({ user_id: SAMPLE_USER, day: d, parent_tag: parent, tag, kind, app_key: appKey, minutes })
  const taskflow_dashboard_area_daily = days.flatMap((d, i) => [
    ...(tfStudy[i]! > 0 ? [area(d, 'Study', 'Study/DSA', 'study', 'dsa', Math.round(tfStudy[i]! * 0.7)), area(d, 'Study', 'Study/Cert', 'study', null, Math.round(tfStudy[i]! * 0.3))] : []),
    ...(tfHustle[i]! > 0 ? [area(d, 'Hustle', 'Hustle/Projects', 'hustle', null, tfHustle[i]!)] : []),
    ...(tfWork[i]! > 0 ? [area(d, 'Work', 'Work/Oland', 'work', null, tfWork[i]!)] : []),
    area(d, 'Wellness', 'Wellness/Gym', 'wellness', null, 30),
  ])
  const taskflow_dashboard_days_off: TaskflowDaysOffRow[] = [{ user_id: SAMPLE_USER, day: dayOff, kind: 'rest', label: 'Rest day' }]
  const taskflow_dashboard_deadlines: TaskflowDeadlineRow[] = [
    { user_id: SAMPLE_USER, task_id: 'sample-t1', title: 'Pass G2', tag: 'Personal', due_on: addDays(today, 2), days_left: 2, hard_deadline: true },
    { user_id: SAMPLE_USER, task_id: 'sample-t2', title: 'Tableau exam', tag: 'Study/Cert', due_on: addDays(today, 6), days_left: 6, hard_deadline: true },
    { user_id: SAMPLE_USER, task_id: 'sample-t3', title: 'Databricks exam', tag: 'Study/Cert', due_on: addDays(today, 41), days_left: 41, hard_deadline: true },
  ]
  const weekStart = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7)) // Monday
  const goal = (id: string, name: string, metric: string, label: string, dir: TaskflowGoalRow['direction'], amount: number, period: TaskflowGoalRow['period'], start: Day, end: Day, progress: number, hit: boolean): TaskflowGoalRow =>
    ({ user_id: SAMPLE_USER, goal_id: id, name, metric, target_label: label, direction: dir, amount, period, period_start: start, period_end: end, progress, hit, paused: false })
  const taskflow_dashboard_goals = [
    goal('g1', 'Study/DSA', 'tag_minutes', '60 min / day', 'at_least', 60, 'day', today, today, 25, false),
    goal('g2', 'Cigarettes', 'counter_count', 'at most 5 / day', 'at_most', 5, 'day', today, today, 3, true),
    goal('g3', 'Study', 'tag_minutes', '15 h / week', 'at_least', 900, 'week', weekStart, addDays(weekStart, 6), 610, false),
    goal('g4', 'Gym', 'activity_count', '3 times / week', 'at_least', 3, 'week', weekStart, addDays(weekStart, 6), 2, false),
    goal('g3', 'Study', 'tag_minutes', '15 h / week', 'at_least', 900, 'week', addDays(weekStart, -7), addDays(weekStart, -1), 950, true),
  ]

  // InteractiveDSA
  const dsaMinutes = [0, 55, 50, 0, 60, 45, 0, 40, 55, 50, 0, 60, 45, 25]
  let dStreak = 0
  const dsa_dashboard_daily = days.flatMap((d, i) => {
    const m = dsaMinutes[i]!
    dStreak = m > 0 ? dStreak + 1 : 0
    if (m === 0 && i % 3 !== 0) return []
    const done = m > 0 ? 2 + (i % 3) : 0
    return [daily('dsa', d, stamp(d), { active_minutes: m, items_done: done, items_planned: 4, streak_current: dStreak, headline: m > 0 ? `${done} problems · quiz 24/30` : 'missed' },
      { week: 3, plan_day_index: 14 + i, plan_day_id: `w3d${i}`, status: m > 0 ? 'done' : 'missed', items_total: 4, items_ticked: done, problems_attempted: done, solved_alone: Math.max(0, done - 1),
        needed_hint: 1, needed_solution: 0, failed: 0, coding_minutes: Math.round(m * 0.6), study_minutes: m, quiz_minutes: Math.round(m * 0.2), quiz_answered: 30, quiz_correct: 24,
        redos_due: 1, catchup_queue_size: 2, current_streak: dStreak, longest_streak: 9 })]
  })
  const dsa_dashboard_now = [now('dsa', hoursAgo(at, 20),
    { contract_version: 1, status_line: 'Week 3 · Day 2 · 2 left today', needs_attention: 3, attention_label: 'catch-up + redos', last_activity_at: hoursAgo(at, 20) },
    { week: 3, day_in_week: 2, plan_progress_pct: 38, solved_alone_total: 41, problems_total: 150, longest_streak: 9, next_redo_on: addDays(today, 1) })]

  // Money
  const money_dashboard_daily = days.map((d, i) => {
    const out = [0, 4200, 0, 1850, 12500, 0, 3300, 0, 2400, 0, 8800, 1500, 0, 2100][i]!
    return daily('money', d, stamp(d), { active_minutes: 0, items_done: out > 0 ? 2 : 0, items_planned: null, streak_current: null, headline: `$${(out / 100).toFixed(0)} out · $${i === 4 ? '2600' : '0'} in` },
      { out_cents: out, in_cents: i === 4 ? 260000 : 0, essential_out_cents: Math.round(out * 0.6), discretionary_out_cents: Math.round(out * 0.4), smoking_out_cents: i % 3 === 0 ? 1400 : 0 })
  })
  const money_dashboard_now = [now('money', upd,
    { contract_version: 1, status_line: 'Oct: $2,140 out · $2,600 in · net +$460', needs_attention: 6, attention_label: 'to categorise / review', last_activity_at: hoursAgo(at, 30) },
    { month_in_cents: 260000, month_out_cents: 214000, month_net_cents: 46000, subscriptions_monthly_cents: 8900, last_import_on: addDays(today, -1), days_since_import: 1, unknown_pct: 6 })]
  const month = (back: number): Day => { const m = new Date(`${today}T12:00:00Z`); m.setUTCDate(1); m.setUTCMonth(m.getUTCMonth() - back); return m.toISOString().slice(0, 10) }
  const money_dashboard_monthly: MoneyMonthlyRow[] = [2, 1, 0].map((back, i) => ({
    user_id: SAMPLE_USER, month: month(back), in_cents: 260000, out_cents: [231000, 198000, 214000][i]!, net_cents: 260000 - [231000, 198000, 214000][i]!,
    essential_cents: [150000, 140000, 138000][i]!, discretionary_cents: [81000, 58000, 76000][i]!, by_category: { Rent: 95000, Groceries: 42000, Transport: 18000, Eating_out: 31000, Subscriptions: 8900 },
  }))

  return {
    trading_dashboard_daily,
    trading_dashboard_now: [now('trading', upd, { contract_version: 1, status_line: '4/6 charts today · 8-day streak', needs_attention: 2, attention_label: 'guesses to grade', last_activity_at: hoursAgo(at, 3) },
      { concepts_learned: 22, concepts_total: 48, guess_accuracy_pct: 61, open_trades: 1, paper_pnl_closed: 184.5, paper_balance: 10184.5, challenge_day: 17 })],
    taskflow_dashboard_daily, taskflow_dashboard_now, taskflow_dashboard_area_daily, taskflow_dashboard_days_off, taskflow_dashboard_deadlines, taskflow_dashboard_goals,
    dsa_dashboard_daily, dsa_dashboard_now, money_dashboard_daily, money_dashboard_now, money_dashboard_monthly,
  }
}

const STD_DAILY = ['user_id', 'day', 'app', 'active_minutes', 'items_done', 'items_planned', 'streak_current', 'headline', 'updated_at'] as const
const STD_NOW = ['user_id', 'app', 'contract_version', 'status_line', 'needs_attention', 'attention_label', 'last_activity_at', 'updated_at'] as const
const pick = <T extends object>(row: T, cols: readonly string[]) => Object.fromEntries(cols.map((c) => [c, (row as Record<string, unknown>)[c]]))

/** The os_* views over the sample views: standard columns only, like the SQL unions. */
export function buildSampleOsViews(v: SampleViews): OsViewRows {
  const dailies = [v.trading_dashboard_daily, v.taskflow_dashboard_daily, v.dsa_dashboard_daily, v.money_dashboard_daily]
  const nows = [v.trading_dashboard_now, v.taskflow_dashboard_now, v.dsa_dashboard_now, v.money_dashboard_now]
  const health: HealthRow[] = [['trading', v.trading_dashboard_now], ['dsa', v.dsa_dashboard_now], ['taskflow', v.taskflow_dashboard_now], ['money', v.money_dashboard_now]]
    .flatMap(([app, rows]) => ['daily', 'now'].map((kind) => ({
      app: app as string, view: `${app as string}_dashboard_${kind}`, exists: true, columns_ok: true, access_ok: true, in_unions: true,
      contract_version: kind === 'now' ? (rows as Now[])[0]!.contract_version : null, last_updated_at: kind === 'now' ? (rows as Now[])[0]!.updated_at : null,
    })))
  return {
    os_daily_activity: dailies.flat().map((r) => pick(r, STD_DAILY) as unknown as DailyRow),
    os_apps_now: nows.flat().map((r) => pick(r, STD_NOW) as unknown as NowRow),
    os_contract_health: health,
  }
}
