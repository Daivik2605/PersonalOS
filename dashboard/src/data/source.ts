// Where Home's data comes from. One interface, two implementations: Supabase (real) and the sample fixtures (dev only).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { OsViewName, OsViewRows, Settings } from '../lib/contract'

export interface DataSource {
  kind: 'supabase' | 'sample'
  view<N extends OsViewName>(name: N): Promise<OsViewRows[N]>
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
