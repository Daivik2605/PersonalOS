// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, HOME_CARDS, moveCard, normalizeCardOrder, validateSettings, withDefaults } from './settings'

describe('settings', () => {
  it('defaults match the table: 240 min goal, Monday, Toronto', () => {
    expect(DEFAULT_SETTINGS).toMatchObject({ daily_goal_minutes: 240, week_starts_on: 1, timezone: 'America/Toronto', theme: 'system' })
  })
  it('fills missing fields from the defaults and tolerates no row', () => {
    expect(withDefaults(null)).toEqual(DEFAULT_SETTINGS)
    expect(withDefaults({ daily_goal_minutes: 300 })).toEqual({ ...DEFAULT_SETTINGS, daily_goal_minutes: 300 })
  })
  it.each([
    [{ daily_goal_minutes: 0 }, true], [{ daily_goal_minutes: 1441 }, true], [{ daily_goal_minutes: 90.5 }, true], [{ daily_goal_minutes: Number.NaN }, true],
    [{ daily_goal_minutes: 1 }, false], [{ daily_goal_minutes: 1440 }, false],
    [{ week_starts_on: 7 }, true], [{ week_starts_on: -1 }, true], [{ week_starts_on: 0 }, false], [{ week_starts_on: 6 }, false],
    [{ theme: 'neon' as never }, true], [{ theme: 'dark' as const }, false], [{}, false],
  ])('validate %j -> error? %s', (patch, bad) => expect(validateSettings(patch) !== null).toBe(bad))

  it('card order: unknown ids dropped, duplicates removed, new cards appended', () => {
    const all = HOME_CARDS.map((c) => c.id as string)
    expect(normalizeCardOrder([])).toEqual(all)
    expect(normalizeCardOrder(['apps', 'gone', 'apps', 'goals'])).toEqual(['apps', 'goals', ...all.filter((i) => i !== 'apps' && i !== 'goals')])
  })
  it('moves a card up or down and stops at the ends', () => {
    expect(moveCard([], 'attention', -1).slice(0, 2)).toEqual(['attention', 'goals'])
    expect(moveCard([], 'goals', -1)).toEqual(normalizeCardOrder([]))
    expect(moveCard([], 'links', 1)).toEqual(normalizeCardOrder([]))
    expect(moveCard([], 'nope', 1)).toEqual(normalizeCardOrder([]))
  })
})
