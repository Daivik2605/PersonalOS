// Home's own settings (os_settings, SPEC §2.1/§3.6): defaults and validation, kept apart from the screen.
import type { Settings } from './contract'

export const DEFAULT_SETTINGS: Settings = {
  daily_goal_minutes: 240,
  week_starts_on: 1,
  timezone: 'America/Toronto',
  hidden_apps: [],
  card_order: [],
  theme: 'system',
}

/** Cards on the Home screen (phase 4 renders them); Settings lets the order change. */
export const HOME_CARDS = [
  { id: 'goals', label: 'Goals today' },
  { id: 'attention', label: 'Needs attention' },
  { id: 'deadlines', label: 'Coming up' },
  { id: 'money', label: 'Money' },
  { id: 'apps', label: 'Apps' },
  { id: 'links', label: 'Quick links' },
] as const

export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const

/** A saved order, with cards it doesn't know dropped and new cards appended — so adding a card later never breaks it. */
export function normalizeCardOrder(saved: readonly string[]): string[] {
  const all = HOME_CARDS.map((c) => c.id as string)
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of saved) if (all.includes(id) && !seen.has(id)) { seen.add(id); out.push(id) }
  for (const id of all) if (!seen.has(id)) out.push(id)
  return out
}

export function moveCard(order: readonly string[], id: string, delta: -1 | 1): string[] {
  const o = normalizeCardOrder(order)
  const i = o.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= o.length) return o
  ;[o[i], o[j]] = [o[j]!, o[i]!]
  return o
}

/** Returns an error message, or null when the patch is acceptable. Mirrors the table's check constraints. */
export function validateSettings(p: Partial<Settings>): string | null {
  if (p.daily_goal_minutes !== undefined && (!Number.isInteger(p.daily_goal_minutes) || p.daily_goal_minutes < 1 || p.daily_goal_minutes > 1440)) {
    return 'The daily goal must be a whole number of minutes between 1 and 1440.'
  }
  if (p.week_starts_on !== undefined && (!Number.isInteger(p.week_starts_on) || p.week_starts_on < 0 || p.week_starts_on > 6)) {
    return 'Pick a day of the week to start on.'
  }
  if (p.theme !== undefined && !['system', 'light', 'dark'].includes(p.theme)) return 'Unknown theme.'
  return null
}

/** Merge a database row (maybe missing, maybe from an older table) over the defaults. */
export function withDefaults(row: Partial<Settings> | null | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(row ?? {}) }
}
