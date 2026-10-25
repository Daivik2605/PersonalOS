// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildSampleViews } from '../fixtures'
import { columnsOf, dailyColumns, formatCell, labelOf, lastDays, nowExtras } from './appPage'
import type { Row } from './home'

const v = buildSampleViews('2026-10-25', new Date('2026-10-25T19:00:00Z'))

describe('appPage', () => {
  it('daily columns: the eight standard ones in contract order (no user_id), then every extra', () => {
    const cols = dailyColumns(v.dsa_dashboard_daily as Row[])
    expect(cols.slice(0, 8)).toEqual(['day', 'app', 'active_minutes', 'items_done', 'items_planned', 'streak_current', 'headline', 'updated_at'])
    expect(cols).toContain('solved_alone'); expect(cols).toContain('longest_streak'); expect(cols).not.toContain('user_id')
    expect(cols.length).toBe(8 + 20)
  })
  it('a column an app adds later shows up with no code change, and differing rows are merged', () => {
    expect(columnsOf([{ day: 'a', brand_new: 1 }, { day: 'b', other: 2 }], ['user_id', 'day'])).toEqual(['day', 'brand_new', 'other'])
  })
  it('now extras are everything after the eight standard columns', () => {
    expect(nowExtras(v.dsa_dashboard_now[0] as Row)).toEqual(['week', 'day_in_week', 'plan_progress_pct', 'solved_alone_total', 'problems_total', 'longest_streak', 'next_redo_on'])
  })
  it('cells: null is a dash not 0, booleans yes/no, timestamps in Toronto time', () => {
    expect(formatCell(null)).toBe('-'); expect(formatCell(0)).toBe('0'); expect(formatCell(true)).toBe('yes'); expect(formatCell('plain')).toBe('plain')
    expect(formatCell('2026-10-25T19:30:00Z')).toMatch(/15:30/)
    expect(formatCell({ a: 1 })).toBe('{"a":1}')
  })
  it('labels and last days', () => {
    expect(labelOf('solved_alone_total')).toBe('solved alone total')
    expect(lastDays(v.dsa_dashboard_daily as Row[], 3).map((r) => r.day)).toEqual(['2026-10-25', '2026-10-24', '2026-10-23'])
  })
})
