import { vi } from 'vitest'
import type { OsViewName, OsViewRows, Settings } from '../lib/contract'
import type { DataSource } from '../data/source'

export function emptyViews(): OsViewRows {
  return { os_daily_activity: [], os_apps_now: [], os_contract_health: [] }
}

/** A controllable DataSource for tests. */
export function fakeSource(views: Partial<OsViewRows> = {}, settings: Partial<Settings> | null = null) {
  const state = { views: { ...emptyViews(), ...views }, settings, fail: false, saveError: null as string | null }
  const src: DataSource & { state: typeof state; saved: Partial<Settings>[] } = {
    kind: 'supabase',
    state,
    saved: [],
    view: vi.fn(async (name: OsViewName) => { if (state.fail) throw new Error('network down'); return state.views[name] as never }) as DataSource['view'],
    settings: vi.fn(async () => { if (state.fail) throw new Error('network down'); return state.settings }),
    saveSettings: vi.fn(async (patch) => { if (state.saveError) return state.saveError; src.saved.push(patch); state.settings = { ...state.settings, ...patch }; return null }),
  }
  return src
}
