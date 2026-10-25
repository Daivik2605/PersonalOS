// Generic rendering of an app's `_now` and `_daily` views (SPEC §3.4): every column, whatever the app adds later.
import type { Row } from './home'

const DAILY_STANDARD = ['user_id', 'day', 'app', 'active_minutes', 'items_done', 'items_planned', 'streak_current', 'headline', 'updated_at']
const NOW_STANDARD = ['user_id', 'app', 'contract_version', 'status_line', 'needs_attention', 'attention_label', 'last_activity_at', 'updated_at']

/** Columns in display order: the standard ones first (as the contract orders them), then every extra in first-seen order. `user_id` is the owner and is left out. */
export function columnsOf(rows: Row[], standard: readonly string[]): string[] {
  const seen = new Set<string>()
  const extras: string[] = []
  for (const r of rows) for (const k of Object.keys(r)) if (!standard.includes(k) && !seen.has(k)) { seen.add(k); extras.push(k) }
  return [...standard.filter((c) => c !== 'user_id' && rows.some((r) => c in r)), ...extras]
}

export const dailyColumns = (rows: Row[]) => columnsOf(rows, DAILY_STANDARD)
/** The `_now` extras: every column after the eight standard ones. */
export const nowExtras = (row: Row) => Object.keys(row).filter((k) => !NOW_STANDARD.includes(k))

const TS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })

/** One cell as text. Null is a dash (unknown), not 0. Timestamps are shown in Toronto time. */
export function formatCell(v: unknown): string {
  if (v === null || v === undefined) return '-'
  if (typeof v === 'boolean') return v ? 'yes' : 'no'
  if (typeof v === 'number') return String(v)
  if (typeof v === 'string') return TS.test(v) && !Number.isNaN(Date.parse(v)) ? fmt.format(new Date(v)) : v
  return JSON.stringify(v)
}

/** Column name as a label: `solved_alone_total` -> `solved alone total`. */
export const labelOf = (col: string) => col.replace(/_/g, ' ')

/** The last `days` daily rows, newest first. */
export function lastDays(rows: Row[], days: number): Row[] {
  return [...rows].sort((a, b) => String(b.day).localeCompare(String(a.day))).slice(0, days)
}
