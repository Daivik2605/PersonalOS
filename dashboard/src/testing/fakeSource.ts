import { vi } from 'vitest'
import type { OsViewName, OsViewRows, Settings } from '../lib/contract'
import { applySince, dashSinceColumn, osSinceColumn, type DashRow, type DataSource } from '../data/source'

export function emptyViews(): OsViewRows {
  return { os_daily_activity: [], os_apps_now: [], os_contract_health: [], os_tag_daily: [], os_productive_daily: [], os_streak: [], os_week: [], os_optional_health: [] }
}

/** A controllable DataSource for tests. */
export function fakeSource(views: Partial<OsViewRows> = {}, settings: Partial<Settings> | null = null) {
  const state = { views: { ...emptyViews(), ...views }, dash: {} as Record<string, DashRow[]>, settings, fail: false, saveError: null as string | null }
  const src: DataSource & { state: typeof state; saved: Partial<Settings>[] } = {
    kind: 'supabase',
    state,
    saved: [],
    view: vi.fn(async (name: OsViewName, opts?: { since?: string; earliest?: boolean }) => { if (state.fail) throw new Error('network down'); return applySince(state.views[name] as object[], osSinceColumn(name), opts) as never }) as DataSource['view'],
    dashboardView: vi.fn(async (name: string, opts?: { since?: string; days?: number; earliest?: boolean }) => { if (state.fail) throw new Error('network down'); return applySince(state.dash[name] ?? [], dashSinceColumn(name), opts) }) as DataSource['dashboardView'],
    settings: vi.fn(async () => { if (state.fail) throw new Error('network down'); return state.settings }),
    saveSettings: vi.fn(async (patch) => { if (state.saveError) return state.saveError; src.saved.push(patch); state.settings = { ...state.settings, ...patch }; return null }),
  }
  return src
}
