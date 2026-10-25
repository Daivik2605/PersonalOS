// Row shapes of the views Home reads. The standard columns come from docs/CONTRACT.md; extras from each app's
// DATA_CONTRACT (or SPEC until it publishes). Timestamps arrive from Supabase as ISO strings, days as YYYY-MM-DD.
import type { Day } from './time'

export interface DailyRow {
  user_id: string
  day: Day
  app: string
  active_minutes: number
  items_done: number
  items_planned: number | null
  streak_current: number | null
  headline: string
  updated_at: string
}

export interface NowRow {
  user_id: string
  app: string
  contract_version: number
  status_line: string
  needs_attention: number
  attention_label: string | null
  last_activity_at: string | null
  updated_at: string
}

/** os_contract_health (SPEC §2.2) plus `access_ok` and `in_unions`. */
export interface HealthRow {
  app: string
  view: string
  exists: boolean
  columns_ok: boolean
  contract_version: number | null
  last_updated_at: string | null
  access_ok: boolean
  in_unions: boolean
}

/** Views Home itself builds (os_core.sql). */
export type OsViewName = 'os_daily_activity' | 'os_apps_now' | 'os_contract_health'
export interface OsViewRows {
  os_daily_activity: DailyRow[]
  os_apps_now: NowRow[]
  os_contract_health: HealthRow[]
}

export interface Settings {
  daily_goal_minutes: number
  week_starts_on: number
  timezone: string
  hidden_apps: string[]
  card_order: string[]
  theme: 'system' | 'light' | 'dark'
}

// ── Extras (only the columns Home uses later are typed; the rest are shown generically on app pages) ──────────────────
export type Extra = Record<string, string | number | boolean | null>

export interface TaskflowAreaDailyRow { user_id: string; day: Day; parent_tag: string; tag: string; kind: string; app_key: string | null; minutes: number }
export interface TaskflowDaysOffRow { user_id: string; day: Day; kind: string; label: string | null }
export interface TaskflowDeadlineRow { user_id: string; task_id: string; title: string; tag: string | null; due_on: Day; days_left: number; hard_deadline: boolean }
export interface TaskflowGoalRow {
  user_id: string; goal_id: string; name: string; metric: string; target_label: string; direction: 'at_least' | 'at_most'
  amount: number; period: 'day' | 'week' | 'month'; period_start: Day; period_end: Day; progress: number; hit: boolean; paused: boolean
}
/** Money's planned monthly view: SPEC §9 names the pieces (in, out, net, essential, discretionary, totals by category). */
export interface MoneyMonthlyRow {
  user_id: string; month: Day; in_cents: number; out_cents: number; net_cents: number
  essential_cents: number; discretionary_cents: number; by_category: Record<string, number>
}

