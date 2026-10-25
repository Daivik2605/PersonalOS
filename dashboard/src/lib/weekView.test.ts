// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import type { TaskflowGoalRow, WeekRow } from './contract'
import { dayBars, formatMetric, tagSplit, weekComparison, weeklyGoals, WEEK_METRICS } from './weekView'
import { weekWindows } from './week'

const TODAY = '2026-10-25' // Sunday: this week is Mon 19 - Sun 25, last week Mon 12 - Sun 18
const v = buildSampleViews(TODAY, new Date('2026-10-25T19:00:00Z'))
const os = buildSampleOsViews(v, TODAY)
const windows = weekWindows(TODAY)
const rows = weekComparison(os.os_week, windows)
const by = (app: string, metric: string) => rows.find((r) => r.spec.app === app && r.spec.metric === metric)!

describe('weekComparison (hand-calculated from the fixture arrays)', () => {
  it('windows', () => expect(windows).toEqual({ thisWeek: '2026-10-19', lastWeek: '2026-10-12' }))
  it('productive time: 913 vs 713 minutes is up 3h 20m (28%)', () => {
    expect(by('os', 'productive_minutes')).toMatchObject({ current: 913, previous: 713, delta: 200, tone: 'neutral', changeText: 'Up 3h 20m (28%)' })
  })
  it('cigarettes are lower-is-better: 23 vs 24 is better, written as text; a rise would be worse', () => {
    expect(by('taskflow', 'cigarettes')).toMatchObject({ current: 23, previous: 24, tone: 'better', changeText: 'Down 1 (4%)' })
    const worse = weekComparison([{ user_id: '', week_start: '2026-10-19', app: 'taskflow', metric: 'cigarettes', value: 30 }, { user_id: '', week_start: '2026-10-12', app: 'taskflow', metric: 'cigarettes', value: 24 }], windows)
    expect(worse[0]).toMatchObject({ tone: 'worse', changeText: 'Up 6 (25%)' })
  })
  it('everything else is neutral, even when it falls', () => {
    expect(by('money', 'in_cents')).toMatchObject({ current: 0, previous: 260000, delta: -260000, tone: 'neutral', changeText: 'Down $2,600 (100%)' })
    expect(by('taskflow', 'work_minutes')).toMatchObject({ current: 450 + 480 + 450 + 480 + 450, previous: 450 + 480 + 450 })
  })
  it('a week without a row is "No data", never 0; a real 0 stays 0', () => {
    const only: WeekRow[] = [{ user_id: '', week_start: '2026-10-19', app: 'dsa', metric: 'items_done', value: 0 }]
    const r = weekComparison(only, windows)[0]!
    expect(r).toMatchObject({ current: 0, previous: null, delta: null, changeText: 'No data last week' })
    expect(formatMetric('count', null)).toBe('No data'); expect(formatMetric('count', 0)).toBe('0')
  })
  it('metrics with no data in either week are left out, in catalogue order', () => {
    expect(weekComparison([], windows)).toEqual([])
    const order = rows.map((r) => WEEK_METRICS.indexOf(r.spec))
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })
  it('only the four lower-is-better metrics are marked', () => {
    expect(WEEK_METRICS.filter((m) => m.lowerBetter).map((m) => m.metric)).toEqual(['cigarettes', 'weed', 'tasks_missed', 'deadlines_missed'])
  })
  it('formats', () => {
    expect(formatMetric('minutes', 150)).toBe('2h 30m'); expect(formatMetric('cents', 46000, true)).toBe('+$460'); expect(formatMetric('decimal', 3.456)).toBe('3.5')
  })
})

describe('tagSplit, dayBars, weeklyGoals', () => {
  it('Study/DSA: 331 this week vs 283 last (the max-rule applied), biggest first', () => {
    const t = tagSplit(os.os_tag_daily, windows)
    expect(t[0]).toMatchObject({ tagPath: 'Study/DSA', current: 331, previous: 283, delta: 48 })
    expect(t.map((x) => x.current).sort((a, b) => b - a)).toEqual(t.map((x) => x.current))
    expect(t.reduce((a, x) => a + x.current, 0)).toBe(913); expect(t.reduce((a, x) => a + x.previous, 0)).toBe(713)
  })
  it('daily bars: seven days, totals per day, parts per parent tag', () => {
    const { bars, series } = dayBars(os.os_tag_daily, os.os_productive_daily, '2026-10-19')
    expect(bars.map((b) => b.total)).toEqual([151, 140, 152, 135, 136, 138, 61])
    expect(bars.every((b) => !b.isDayOff)).toBe(true)
    expect(series[0]).toBe('Study')
    expect(bars[0]!.parts).toEqual({ Study: 121, Hustle: 30 }) // 46 + 20 + 55 and 30
  })
  it('days off are flagged on the bar for that day', () => {
    const { bars } = dayBars(os.os_tag_daily, os.os_productive_daily, '2026-10-12')
    expect(bars.map((b) => b.isDayOff)).toEqual([false, false, false, false, false, true, false])
    expect(bars[5]!.total).toBe(75)
  })
  it('weekly goals: this period\'s progress and how the last finished period ended', () => {
    const g = weeklyGoals(v.taskflow_dashboard_goals, TODAY)
    expect(g.map((x) => x.name)).toEqual(['Gym', 'Study'])
    expect(g[1]).toMatchObject({ id: 'g3', current: { progress: 610, percent: 68 }, last: { progress: 950, state: 'hit' } })
    expect(g[0]!.last).toBeNull()
  })
  it('daily, monthly and paused goals are not weekly goals', () => {
    const base = v.taskflow_dashboard_goals[0]! as TaskflowGoalRow
    expect(weeklyGoals([base, { ...base, period: 'month' }, { ...base, period: 'week', paused: true }], TODAY)).toEqual([])
  })
})
