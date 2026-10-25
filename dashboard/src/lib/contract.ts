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

/** os_tag_daily (SPEC §2.2): minutes per tag per day after the max-rule. `source`: taskflow = as TaskFlow recorded, max = raised to
 *  what the linked app measured, app = app minutes with no TaskFlow row. `tag_path` is `Study/DSA` or `Break` (the timer deep-link string). */
export interface TagDailyRow {
  user_id: string; day: Day; parent_tag: string; tag: string; kind: string; app_key: string | null
  minutes: number; source: 'taskflow' | 'max' | 'app'; tag_path: string
}
/** os_productive_daily: study + hustle minutes per day; a row exists for days with minutes or marked as days off. */
export interface ProductiveDailyRow { user_id: string; day: Day; minutes: number; is_day_off: boolean }
/** os_streak: one row per user with at least one productive day. */
export interface StreakRow { user_id: string; current: number; longest: number; last_productive_day: Day }
/** os_week: long format, one row per user per week per app per metric. Money metrics are cents; sleep is minutes (an average). */
export interface WeekRow { user_id: string; week_start: Day; app: string; metric: string; value: number }
/** os_optional_health: the optional TaskFlow views the productive-time views use (reported when invalid). */
export interface OptionalHealthRow { app: string; view: string; exists: boolean; columns_ok: boolean; access_ok: boolean; in_use: boolean }

/** Views Home itself builds (os_core.sql). */
export type OsViewName =
  | 'os_daily_activity' | 'os_apps_now' | 'os_contract_health'
  | 'os_tag_daily' | 'os_productive_daily' | 'os_streak' | 'os_week' | 'os_optional_health'
export interface OsViewRows {
  os_daily_activity: DailyRow[]
  os_apps_now: NowRow[]
  os_contract_health: HealthRow[]
  os_tag_daily: TagDailyRow[]
  os_productive_daily: ProductiveDailyRow[]
  os_streak: StreakRow[]
  os_week: WeekRow[]
  os_optional_health: OptionalHealthRow[]
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

/** `tag` is the sub-tag's name ("DSA") or the parent's own name ("Break"), never null; `tag_path` is "Study/DSA" or "Break". */
export interface TaskflowAreaDailyRow { user_id: string; day: Day; parent_tag: string; tag: string; tag_path: string; kind: string; app_key: string | null; minutes: number }
export interface TaskflowDaysOffRow { user_id: string; day: Day; kind: string; label: string | null }
export interface TaskflowDeadlineRow { user_id: string; task_id: string; title: string; tag: string | null; due_on: Day; days_left: number; hard_deadline: boolean }
export interface TaskflowGoalRow {
  user_id: string; goal_id: string; name: string; metric: string; target_label: string; direction: 'at_least' | 'at_most'
  amount: number; period: 'day' | 'week' | 'month'; period_start: Day; period_end: Day; progress: number; hit: boolean; paused: boolean
  /** The goal's tag as in `_area_daily` (`Study/DSA`) for `tag_minutes` goals, else null: links to /timer?tag=<tag_path>. */
  tag_path: string | null
  /** For `counter_count` goals the `_daily` column the counter maps to (`cigarettes`, `weed`), else null. Absent until TaskFlow publishes it. */
  counter_key?: string | null
}
/** Money's monthly view (money/docs/SPEC.md §9): `month` is the first day of the month, `by_category` is cents of money out by category path. */
export interface MoneyMonthlyRow {
  user_id: string; month: Day; in_cents: number; out_cents: number; net_cents: number
  essential_cents: number; discretionary_cents: number; by_category: Record<string, number>
}

