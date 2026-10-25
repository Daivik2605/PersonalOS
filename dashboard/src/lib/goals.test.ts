// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TaskflowGoalRow } from './contract'
import { currentGoals, goalHistory, goalView, hitCount } from './goals'

const T = '2026-10-25' // a Sunday
const g = (o: Partial<TaskflowGoalRow>): TaskflowGoalRow => ({
  user_id: '', goal_id: 'g1', name: 'Study/DSA', metric: 'tag_minutes', target_label: '60 min / day', direction: 'at_least', amount: 60,
  period: 'day', period_start: T, period_end: T, progress: 25, hit: false, paused: false, tag_path: 'Study/DSA', counter_key: null, ...o,
})

describe('goalView', () => {
  it('at-least goal in progress, with percent, text and a timer deep link', () => {
    expect(goalView(g({}), T)).toMatchObject({ state: 'in-progress', percent: 42, progressText: '25m / 1h 00m', link: '/timer?tag=Study%2FDSA', counterKey: null })
  })
  it('time goals link by tag_path, not by name; without a tag_path (or for other goal types) the link is /goals', () => {
    expect(goalView(g({ name: 'Anything', tag_path: 'Study/DSA' }), T).link).toBe('/timer?tag=Study%2FDSA')
    expect(goalView(g({ tag_path: 'Break' }), T).link).toBe('/timer?tag=Break')
    expect(goalView(g({ tag_path: null }), T).link).toBe('/goals')
    expect(goalView(g({ metric: 'activity_count', tag_path: null }), T).link).toBe('/goals')
    expect(goalView(g({ metric: 'counter_count', tag_path: null, counter_key: 'weed' }), T)).toMatchObject({ link: '/goals', counterKey: 'weed' })
  })
  it('hit comes from TaskFlow, not from Home', () => {
    expect(goalView(g({ progress: 70, hit: true }), T)).toMatchObject({ state: 'hit', percent: 100 })
    expect(goalView(g({ progress: 70, hit: false }), T).state).toBe('in-progress') // we don't second-guess TaskFlow's judgement
  })
  it('a finished period that was not hit is missed', () => {
    expect(goalView(g({ period_start: '2026-10-18', period_end: '2026-10-24', hit: false }), T).state).toBe('missed')
  })
  it('at-most limits: within, warning at 80%, over', () => {
    const c = (progress: number, hit: boolean) => goalView(g({ metric: 'counter_count', direction: 'at_most', amount: 5, progress, hit }), T)
    expect(c(2, true)).toMatchObject({ state: 'within', link: '/goals', progressText: '2 / 5' })
    expect(c(4, true).state).toBe('warning')
    expect(c(6, false)).toMatchObject({ state: 'over', percent: 100 })
  })
  it('a finished at-most period that held is within, not warning', () => {
    expect(goalView(g({ metric: 'counter_count', direction: 'at_most', amount: 5, progress: 5, hit: true, period_start: '2026-10-18', period_end: '2026-10-24' }), T).state).toBe('within')
  })
})

describe('currentGoals, history, counts', () => {
  const rows = [
    g({ goal_id: 'a', name: 'Gym', metric: 'activity_count', period: 'week', period_start: '2026-10-19', period_end: '2026-10-25', amount: 3, progress: 2 }),
    g({ goal_id: 'b' }),
    g({ goal_id: 'a', name: 'Gym', metric: 'activity_count', period: 'week', period_start: '2026-10-12', period_end: '2026-10-18', amount: 3, progress: 3, hit: true }),
    g({ goal_id: 'c', period: 'day', period_start: '2026-10-24', period_end: '2026-10-24', hit: true }),
  ]
  it('current goals only, daily before weekly', () => {
    expect(currentGoals(rows, T).map((x) => x.id)).toEqual(['b', 'a'])
  })
  it('history is oldest first', () => {
    expect(goalHistory(rows, 'a', T).map((x) => x.periodStart)).toEqual(['2026-10-12', '2026-10-19'])
  })
  it('counts finished periods only', () => {
    expect(hitCount(rows, 'week', T)).toEqual({ hit: 1, total: 1 })
    expect(hitCount(rows, 'day', T)).toEqual({ hit: 1, total: 1 })
  })
  it('no goals gives an empty list, not an error', () => {
    expect(currentGoals([], T)).toEqual([])
    expect(hitCount([], 'week', T)).toEqual({ hit: 0, total: 0 })
  })
})
