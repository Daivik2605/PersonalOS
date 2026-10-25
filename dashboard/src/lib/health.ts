// Data-health rules (SPEC §3.5). Pure: given the contract-health rows and the apps' `_now` rows, say what to show.
import type { AppEntry } from './apps'
import { APPS } from './apps'
import type { HealthRow, NowRow } from './contract'

export const STALE_DAYS = 2
const DAY_MS = 86_400_000

export type HealthState =
  | 'not-published'     // neither view exists: "not published yet", never a fake zero
  | 'contract-broken'   // a view exists but doesn't match the contract (see `problems`)
  | 'needs-rerun'       // both views are valid but not in the unions yet: re-run os_core.sql
  | 'ok'

export interface AppHealth {
  dataKey: string
  name: string
  /** True for apps in the registry; false for an app discovered by view name (e.g. "demo"). */
  known: boolean
  state: HealthState
  problems: string[]
  contractVersion: number | null
  /** When the app's `_now` view last changed (updated_at). */
  updatedAt: string | null
  /** Last real activity (last_activity_at): plain information, never a warning. */
  lastActivityAt: string | null
  /** Only ever true for apps that sync (registry `syncs`), when updatedAt is more than STALE_DAYS old. */
  stale: boolean
}

function viewProblem(r: HealthRow | undefined, label: string): string | null {
  if (!r || !r.exists) return null
  if (!r.columns_ok) return `${label} view doesn't match the contract columns`
  if (!r.access_ok) return `${label} view is not security_invoker or not readable by signed-in users`
  return null
}

export function isStale(syncs: boolean, updatedAt: string | null, now: Date): boolean {
  if (!syncs || !updatedAt) return false
  return now.getTime() - new Date(updatedAt).getTime() > STALE_DAYS * DAY_MS
}

export function appHealth(key: string, entry: AppEntry | undefined, health: HealthRow[], nowRows: NowRow[], now: Date): AppHealth {
  const daily = health.find((h) => h.view === `${key}_dashboard_daily`)
  const nowView = health.find((h) => h.view === `${key}_dashboard_now`)
  const present = [daily, nowView].filter((h): h is HealthRow => !!h && h.exists)
  const problems = [viewProblem(daily, 'Daily'), viewProblem(nowView, 'Now')].filter((p): p is string => p !== null)
  if (present.length === 1) problems.unshift(`Only ${present[0]!.view} exists; both views are needed`)

  let state: HealthState
  if (present.length === 0) state = 'not-published'
  else if (problems.length > 0) state = 'contract-broken'
  else if (!present.every((h) => h.in_unions)) state = 'needs-rerun'
  else state = 'ok'

  const nr = nowRows.find((r) => r.app === key)
  const updatedAt = nowView?.last_updated_at ?? nr?.updated_at ?? null
  return {
    dataKey: key,
    name: entry?.name ?? key,
    known: !!entry,
    state,
    problems,
    contractVersion: nowView?.contract_version ?? null,
    updatedAt,
    lastActivityAt: nr?.last_activity_at ?? null,
    stale: state !== 'not-published' && isStale(entry?.syncs ?? false, updatedAt, now),
  }
}

/** One entry per registry app (in registry order), then any extra app found by name (e.g. a new app not yet in apps.ts). */
export function allAppHealth(health: HealthRow[], nowRows: NowRow[], now: Date): AppHealth[] {
  const known = APPS.map((a) => appHealth(a.dataKey, a, health, nowRows, now))
  const extra = [...new Set(health.map((h) => h.app))]
    .filter((k) => !APPS.some((a) => a.dataKey === k))
    .sort()
    .map((k) => appHealth(k, undefined, health, nowRows, now))
  return [...known, ...extra]
}

/** "3 min ago", "2 days ago". `null` means we never had the data. */
export function ago(from: string | Date | null, now: Date): string {
  if (!from) return 'never'
  const ms = now.getTime() - new Date(from).getTime()
  if (ms < 0 || ms < 45_000) return 'just now'
  const min = Math.round(ms / 60_000)
  if (min < 60) return `${min} min ago`
  const h = Math.round(ms / 3_600_000)
  if (h < 24) return `${h} h ago`
  const d = Math.floor(ms / DAY_MS)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
