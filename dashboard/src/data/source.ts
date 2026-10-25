// Where Home's data comes from. One interface, two implementations: Supabase (real) and the sample fixtures (dev only).
import type { SupabaseClient } from '@supabase/supabase-js'
import { APPS } from '../lib/apps'
import type { OsViewName, OsViewRows, Settings } from '../lib/contract'
import { addDays, todayToronto } from '../lib/time'

/** A row of a published `<app>_dashboard_*` view; columns beyond the contract's are the app's own. */
export type DashRow = Record<string, unknown>

const DASH_NAME = new RegExp(`^(${APPS.map((a) => a.dataKey).join('|')})_dashboard_(daily|now|goals|deadlines|monthly|area_daily|days_off)$`)
/** Home may read only the registered apps' published dashboard views (CLAUDE.md: never an app's tables). */
export const isDashboardView = (name: string) => DASH_NAME.test(name)

/** The view does not exist (yet): the app hasn't published it. Not an outage, so Home shows "no data" instead of a banner. */
export class ViewMissingError extends Error {}
const MISSING_CODES = new Set(['PGRST205', '42P01'])

export interface DataSource {
  kind: 'supabase' | 'sample'
  view<N extends OsViewName>(name: N): Promise<OsViewRows[N]>
  /** A published app view, newest `days` days for `_daily` views. Throws for a name that is not a registered app's dashboard view. */
  dashboardView(name: string, opts?: { days?: number }): Promise<DashRow[]>
  /** The saved settings row, or null when none exists yet (defaults apply). Throws on failure. */
  settings(): Promise<Partial<Settings> | null>
  /** Returns an error message, or null on success. */
  saveSettings(patch: Partial<Settings>): Promise<string | null>
}

/** Supabase returns at most 1000 rows per request, so read in pages. */
export const PAGE = 1000
const ORDER: Record<OsViewName, string[]> = {
  os_daily_activity: ['day', 'app'],
  os_apps_now: ['app'],
  os_contract_health: ['app', 'view'],
  os_tag_daily: ['day', 'tag_path'],
  os_productive_daily: ['day'],
  os_streak: ['user_id'],
  os_week: ['week_start', 'app', 'metric'],
  os_optional_health: ['view'],
}

export function supabaseSource(client: SupabaseClient, userId: string): DataSource {
  return {
    kind: 'supabase',
    async view(name) {
      const out: unknown[] = []
      for (let from = 0; ; from += PAGE) {
        let q = client.from(name).select('*')
        for (const col of ORDER[name]) q = q.order(col, { ascending: true })
        const { data, error } = await q.range(from, from + PAGE - 1)
        if (error) throw new Error(error.message)
        out.push(...(data ?? []))
        if (!data || data.length < PAGE) break
      }
      return out as never
    },
    async dashboardView(name, opts) {
      if (!isDashboardView(name)) throw new Error(`Not a dashboard view: ${name}`)
      const daily = name.endsWith('_daily') && !name.endsWith('_area_daily')
      const order = daily || name.endsWith('_area_daily') || name.endsWith('_days_off') ? ['day'] : name.endsWith('_goals') ? ['goal_id', 'period_start'] : name.endsWith('_deadlines') ? ['due_on', 'task_id'] : name.endsWith('_monthly') ? ['month'] : []
      const since = opts?.days ? addDays(todayToronto(), -(opts.days - 1)) : null
      const out: DashRow[] = []
      for (let from = 0; ; from += PAGE) {
        let q = client.from(name).select('*')
        if (since && order[0] === 'day') q = q.gte('day', since)
        for (const col of order) q = q.order(col, { ascending: !daily })
        const { data, error } = await q.range(from, from + PAGE - 1)
        if (error) throw MISSING_CODES.has(error.code) ? new ViewMissingError(error.message) : new Error(error.message)
        out.push(...((data ?? []) as DashRow[]))
        if (!data || data.length < PAGE) break
      }
      return out
    },
    async settings() {
      const { data, error } = await client.from('os_settings').select('*').maybeSingle()
      if (error) throw new Error(error.message)
      return (data as Partial<Settings> | null) ?? null
    },
    async saveSettings(patch) {
      const { error } = await client.from('os_settings').upsert({ ...patch, user_id: userId }, { onConflict: 'user_id' })
      return error ? error.message : null
    },
  }
}
