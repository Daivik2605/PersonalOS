// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { DailyRow, ProductiveDailyRow, WeekRow } from './contract'
import { compareWeeks, weekRows, weekStartOf, weekValue, weekWindows } from './week'

const daily = (app: string, day: string, active: number, done = 1): DailyRow =>
  ({ user_id: '', day, app, active_minutes: active, items_done: done, items_planned: null, streak_current: null, headline: '', updated_at: '' })
const prod = (day: string, minutes: number, off = false): ProductiveDailyRow => ({ user_id: '', day, minutes, is_day_off: off })

describe('week windows', () => {
  it('Monday and Sunday weeks, including across the November DST change', () => {
    expect(weekStartOf('2026-11-01')).toBe('2026-10-26') // Sunday, clocks go back that night
    expect(weekStartOf('2026-11-02')).toBe('2026-11-02')
    expect(weekStartOf('2026-11-01', 0)).toBe('2026-11-01')
    expect(weekStartOf('2026-10-31', 0)).toBe('2026-10-25')
  })
  it('windows are this week and the week before', () => {
    expect(weekWindows('2026-03-11')).toEqual({ thisWeek: '2026-03-09', lastWeek: '2026-03-02' }) // week of the March DST change
  })
})

describe('weekRows (same aggregation as os_week)', () => {
  const trading = [daily('trading', '2026-10-30', 30), daily('trading', '2026-10-31', 30), daily('trading', '2026-11-01', 30), daily('trading', '2026-11-02', 60)]
  const productive = trading.map((t) => prod(t.day, t.active_minutes))
  const rows = weekRows({ daily: trading, productive }, 1)
  it('splits at the Monday and sums', () => {
    expect(weekValue(rows, '2026-10-26', 'os', 'productive_minutes')).toBe(90)
    expect(weekValue(rows, '2026-11-02', 'os', 'productive_minutes')).toBe(60)
    expect(weekValue(rows, '2026-11-02', 'trading', 'items_done')).toBe(1)
  })
  it('splits at the Sunday when the week starts on Sunday', () => {
    const s = weekRows({ daily: trading, productive }, 0)
    expect(weekValue(s, '2026-10-25', 'os', 'productive_minutes')).toBe(60)
    expect(weekValue(s, '2026-11-01', 'os', 'productive_minutes')).toBe(90)
  })
  it('counts days off, and sums money with net = in - out', () => {
    const r = weekRows({
      daily: [], productive: [prod('2026-11-03', 0, true)],
      moneyDaily: [
        { day: '2026-11-02', in_cents: 100000, out_cents: 4000, essential_out_cents: 3000, discretionary_out_cents: 1000, smoking_out_cents: 500 },
        { day: '2026-11-03', in_cents: 0, out_cents: 1000, essential_out_cents: 600, discretionary_out_cents: 400, smoking_out_cents: 0 },
      ],
    })
    expect(weekValue(r, '2026-11-02', 'os', 'days_off')).toBe(1)
    expect(weekValue(r, '2026-11-02', 'money', 'in_cents')).toBe(100000)
    expect(weekValue(r, '2026-11-02', 'money', 'out_cents')).toBe(5000)
    expect(weekValue(r, '2026-11-02', 'money', 'net_cents')).toBe(95000)
    expect(weekValue(r, '2026-11-02', 'money', 'smoking_out_cents')).toBe(500)
  })
  it('TaskFlow: sums, sleep and mood averaged over the days that have them; absent columns are not invented', () => {
    const r = weekRows({
      daily: [], productive: [],
      taskflowDaily: [
        { day: '2026-10-30', work_minutes: 480, sleep_minutes: 420, mood: 3, cigarettes: 4 },
        { day: '2026-10-31', work_minutes: 0, sleep_minutes: 0, mood: null, cigarettes: 2 },
        { day: '2026-11-01', work_minutes: 0, sleep_minutes: 500, mood: 5, cigarettes: 1 },
      ],
    })
    expect(weekValue(r, '2026-10-26', 'taskflow', 'work_minutes')).toBe(480)
    expect(weekValue(r, '2026-10-26', 'taskflow', 'cigarettes')).toBe(7)
    expect(weekValue(r, '2026-10-26', 'taskflow', 'sleep_minutes')).toBe(460)
    expect(weekValue(r, '2026-10-26', 'taskflow', 'mood')).toBe(4)
    expect(weekValue(r, '2026-10-26', 'taskflow', 'weed')).toBeNull()
    expect(weekValue(r, '2026-10-26', 'taskflow', 'energy')).toBeNull()
  })
})

describe('compareWeeks', () => {
  const w: WeekRow[] = [
    { user_id: '', week_start: '2026-10-26', app: 'os', metric: 'productive_minutes', value: 600 },
    { user_id: '', week_start: '2026-11-02', app: 'os', metric: 'productive_minutes', value: 720 },
    { user_id: '', week_start: '2026-11-02', app: 'taskflow', metric: 'weed', value: 0 },
    { user_id: '', week_start: '2026-10-26', app: 'dsa', metric: 'items_done', value: 5 },
    { user_id: '', week_start: '2026-10-19', app: 'dsa', metric: 'items_done', value: 99 }, // outside both windows
  ]
  const d = compareWeeks(w, { thisWeek: '2026-11-02', lastWeek: '2026-10-26' })
  it('gives delta and percent when both weeks have data', () => {
    expect(d.find((x) => x.app === 'os')).toEqual({ app: 'os', metric: 'productive_minutes', current: 720, previous: 600, delta: 120, pct: 20 })
  })
  it('a week with no row is null ("no data"), never 0 — and a real 0 stays 0', () => {
    expect(d.find((x) => x.app === 'dsa')).toEqual({ app: 'dsa', metric: 'items_done', current: null, previous: 5, delta: null, pct: null })
    expect(d.find((x) => x.app === 'taskflow')).toMatchObject({ current: 0, previous: null, delta: null })
  })
  it('percent is null when last week was 0', () => {
    const z = compareWeeks([{ ...w[0]!, value: 0 }, w[1]!], { thisWeek: '2026-11-02', lastWeek: '2026-10-26' })
    expect(z[0]).toMatchObject({ delta: 720, pct: null })
  })
})
