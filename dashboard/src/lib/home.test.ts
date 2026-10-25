// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { TaskflowGoalRow } from './contract'
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import { allAppHealth } from './health'
import { buildHome, formatCents, readableApps, type HomeInput, type Row } from './home'

const NOW = new Date('2026-10-25T19:00:00Z') // Sunday 15:00 in Toronto: half of the 08:00-22:00 window
const TODAY = '2026-10-25'
const v = buildSampleViews(TODAY, NOW)
const os = buildSampleOsViews(v, TODAY)
const health = allAppHealth(os.os_contract_health, os.os_apps_now, NOW)

const full = (over: Partial<HomeInput> = {}): HomeInput => ({
  now: NOW, dailyGoalMinutes: 240, health, appsNow: os.os_apps_now, productive: os.os_productive_daily, streak: os.os_streak,
  daysOff: v.taskflow_dashboard_days_off, tfDaily: v.taskflow_dashboard_daily as Row[], tfNow: v.taskflow_dashboard_now[0] as Row,
  goals: v.taskflow_dashboard_goals, deadlines: v.taskflow_dashboard_deadlines, moneyNow: v.money_dashboard_now[0] as Row, hiddenApps: [], ...over,
})
const none = allAppHealth([], [], NOW)

describe('buildHome, all apps (sample data, hand-calculated)', () => {
  const m = buildHome(full())
  it('header: 61 productive minutes (TaskFlow DSA 25 + Cert 11, trading 25) vs 240, behind pace at 15:00', () => {
    expect(m.header.ring).toMatchObject({ state: 'in-progress', minutes: 61, percent: 25, label: '2h 59m left', hint: 'behind' })
  })
  it('streak 13 (14 days, one day off), last night 7h 10m, work 0m', () => {
    expect(m.header.streak).toEqual({ current: 13, longest: 13 })
    expect(m.header.sleepMinutes).toBe(430)
    expect(m.header.workMinutes).toBe(0)
  })
  it('counters: today, 7-day average over the days before today, limit from counter_key', () => {
    expect(m.header.counters).toEqual([
      { key: 'cigarettes', label: 'Cig', today: 3, avg7: 3.3, limit: 5, tone: 'ok' },
      { key: 'weed', label: 'Weed', today: 0, avg7: 0.4, limit: 1, tone: 'ok' },
    ])
  })
  it('goals: three daily, two longer (this week only)', () => {
    expect(m.goals.daily.map((g) => g.id)).toEqual(['g2', 'g1', 'g5'])
    expect(m.goals.longer.map((g) => g.id).sort()).toEqual(['g3', 'g4'])
    expect(m.goals.daily[1]).toMatchObject({ link: '/timer?tag=Study%2FDSA', progressText: '25m / 1h 00m' })
  })
  it('attention: weekly review first (review_due), then counts biggest first, each with its documented route', () => {
    expect(m.attention[0]).toMatchObject({ id: 'taskflow-review', label: 'Weekly review due', count: null, path: '/review' })
    expect(m.attention[1]).toMatchObject({ appKey: 'money', count: 6 })
    const by = Object.fromEntries(m.attention.map((a) => [a.id, a]))
    expect(by['taskflow-overdue']).toMatchObject({ count: 2, path: '/tasks?view=today' })
    expect(by['taskflow-shifts']).toMatchObject({ count: 1, path: '/work' })
    expect(by['taskflow-cold']).toMatchObject({ count: 1, path: '/' })
    expect(by['dsa-attention']).toMatchObject({ count: 3, label: 'catch-up + redos', path: '/' })
    expect(by['trading-attention']).toMatchObject({ count: 2, label: 'guesses to grade' })
    const counts = m.attention.slice(1).map((a) => a.count!)
    expect(counts).toEqual([...counts].sort((a, b) => b - a))
  })
  it('deadlines: recomputed in Toronto time, red at 2 days or less, amber at 7 or less', () => {
    expect(m.deadlines.map((d) => [d.title, d.daysLeft, d.tone, d.text])).toEqual([
      ['Pass G2', 2, 'red', '2 days'], ['Tableau exam', 6, 'amber', '6 days'], ['Databricks exam', 41, 'none', '41 days'],
    ])
  })
  it('money and tiles', () => {
    expect(m.money).toEqual({ inCents: 260000, outCents: 214000, netCents: 46000, subscriptionsCents: 8900, toCategorise: 6, toCategoriseLabel: 'to categorise / review' })
    expect(m.tiles.map((t) => [t.dataKey, t.state])).toEqual([['trading', 'ok'], ['dsa', 'ok'], ['taskflow', 'ok'], ['money', 'ok']])
    expect(m.tiles.find((t) => t.dataKey === 'dsa')?.statusLine).toBe('Week 3 · Day 2 · 2 left today')
  })
})

describe('buildHome, empty and partial', () => {
  it('zero apps: no data, never zero', () => {
    const m = buildHome({ ...full(), health: none, appsNow: [], productive: [], streak: [], daysOff: null, tfDaily: null, tfNow: null, goals: null, deadlines: null, moneyNow: null })
    expect(m.anyPublished).toBe(false)
    expect(m.header).toMatchObject({ ring: { state: 'no-data', minutes: null, label: 'No data' }, streak: null, workMinutes: null, sleepMinutes: null, counters: [] })
    expect(m.attention).toEqual([]); expect(m.deadlines).toEqual([]); expect(m.money).toBeNull()
    expect(m.goals).toEqual({ daily: [], longer: [] })
    expect(m.tiles).toHaveLength(4)
    expect(m.tiles.every((t) => t.state === 'not-published' && t.statusLine === null)).toBe(true)
  })
  it('one app (trading only): productive from its minutes, everything TaskFlow shows no data', () => {
    const tradingOnly = allAppHealth(os.os_contract_health.filter((h) => h.app === 'trading').concat(os.os_contract_health.filter((h) => h.app !== 'trading').map((h) => ({ ...h, exists: false, columns_ok: false, in_unions: false }))), os.os_apps_now.filter((r) => r.app === 'trading'), NOW)
    const m = buildHome(full({ health: tradingOnly, appsNow: os.os_apps_now.filter((r) => r.app === 'trading'), productive: [{ user_id: 'u', day: TODAY, minutes: 25, is_day_off: false }], streak: [], daysOff: null, tfDaily: null, tfNow: null, goals: null, deadlines: null, moneyNow: null }))
    expect(m.anyPublished).toBe(true)
    expect(m.header.ring).toMatchObject({ state: 'in-progress', minutes: 25 })
    expect(m.header.streak).toBeNull()
    expect(m.header.workMinutes).toBeNull(); expect(m.header.sleepMinutes).toBeNull()
    expect(m.attention).toEqual([{ id: 'trading-attention', appKey: 'trading', label: 'guesses to grade', count: 2, path: '/' }])
    expect(m.tiles.map((t) => t.state)).toEqual(['ok', 'not-published', 'not-published', 'not-published'])
  })
  it('a published app with no row for today did nothing today: 0, but no sleep row is no data, not 0', () => {
    const m = buildHome(full({ productive: [], tfDaily: v.taskflow_dashboard_daily.filter((r) => r.day !== TODAY) as Row[] }))
    expect(m.header.ring.minutes).toBe(0)
    expect(m.header.workMinutes).toBe(0)
    expect(m.header.sleepMinutes).toBeNull()
  })
})

describe('day off', () => {
  it('os_productive_daily.is_day_off today: "Day off", no hint, never behind', () => {
    const m = buildHome(full({ productive: [{ user_id: 'u', day: TODAY, minutes: 0, is_day_off: true }] }))
    expect(m.isDayOff).toBe(true)
    expect(m.header.ring).toMatchObject({ state: 'day-off', label: 'Day off', hint: null })
  })
  it('taskflow_dashboard_days_off today works on its own', () => {
    const m = buildHome(full({ productive: [], daysOff: [{ day: TODAY }] }))
    expect(m.header.ring).toMatchObject({ state: 'day-off', label: 'Day off', hint: null })
  })
  it('yesterday off is not today off', () => {
    expect(buildHome(full({ daysOff: [{ day: '2026-10-24' }] })).isDayOff).toBe(false)
  })
})

describe('TaskFlow columns that may not exist yet', () => {
  const goalsNoKey = v.taskflow_dashboard_goals.map(({ counter_key: _k, ...g }) => g as TaskflowGoalRow)
  it('without counter_key there is no limit colour, even when a goal is named like the counter', () => {
    const m = buildHome(full({ goals: goalsNoKey }))
    expect(m.header.counters.map((c) => [c.key, c.limit, c.tone])).toEqual([['cigarettes', null, 'none'], ['weed', null, 'none']])
  })
  it('a counter goal over its limit is red, at 80% amber, matched by counter_key only', () => {
    const goals = (progress: number, hit: boolean, key: string | null) => v.taskflow_dashboard_goals.map((g) => (g.goal_id === 'g2' ? { ...g, progress, hit, counter_key: key } : g))
    expect(buildHome(full({ goals: goals(6, false, 'cigarettes') })).header.counters[0]).toMatchObject({ tone: 'red', limit: 5 })
    expect(buildHome(full({ goals: goals(4, true, 'cigarettes') })).header.counters[0]).toMatchObject({ tone: 'amber' })
    expect(buildHome(full({ goals: goals(6, false, null) })).header.counters[0]).toMatchObject({ tone: 'none', limit: null })
  })
  it('the counter average only covers days since TaskFlow\'s first row (days before it are not zeros)', () => {
    // sample cigarettes: yesterday 2, two days ago 4, three days ago 3, then 5, 2, 4, 3
    const avg = (tfFirstDay: string | null) => buildHome(full({ tfFirstDay })).header.counters[0]!.avg7
    expect(avg(null)).toBe(3.3) // first row 13 days ago: all 7 days count -> 23 / 7
    expect(avg('2026-10-18')).toBe(3.3) // exactly 7 days back is the first counted day
    expect(avg('2026-10-23')).toBe(3) // started 2 days ago: (2 + 4) / 2
    expect(avg('2026-10-24')).toBe(2) // started yesterday: 2 / 1
    expect(avg('2026-10-25')).toBeNull() // started today: nothing earlier to average
  })
  it('a counter the view has no column for is not shown', () => {
    const noWeed = v.taskflow_dashboard_daily.map(({ weed: _w, ...r }) => r as Row)
    expect(buildHome(full({ tfDaily: noWeed })).header.counters.map((c) => c.key)).toEqual(['cigarettes'])
  })
  it('weekly review: only when review_due is true; a missing or false column leaves it out', () => {
    const now = (extra: Row) => ({ ...(v.taskflow_dashboard_now[0] as Row), ...extra })
    const ids = (tfNow: Row) => buildHome(full({ tfNow })).attention.map((a) => a.id)
    expect(ids(now({ review_due: true }))).toContain('taskflow-review')
    expect(ids(now({ review_due: false }))).not.toContain('taskflow-review')
    const { review_due: _d, review_day: _y, ...without } = now({})
    expect(ids(without)).not.toContain('taskflow-review')
  })
  it('without TaskFlow extras the TaskFlow attention count still shows, linking to Today', () => {
    const m = buildHome(full({ tfNow: null }))
    expect(m.attention.find((a) => a.id === 'taskflow-attention')).toMatchObject({ count: 3, path: '/tasks?view=today' })
  })
  it('sleep is the night that ended this morning; 0 sleep is no data', () => {
    const zero = v.taskflow_dashboard_daily.map((r) => (r.day === TODAY ? { ...r, sleep_minutes: 0 } : r)) as Row[]
    expect(buildHome(full({ tfDaily: zero })).header.sleepMinutes).toBeNull()
  })
})

describe('settings and helpers', () => {
  it('hidden apps drop their tiles, attention items, deadlines and money', () => {
    const m = buildHome(full({ hiddenApps: ['taskflow', 'money'] }))
    expect(m.tiles.map((t) => t.dataKey)).toEqual(['trading', 'dsa'])
    expect(m.attention.map((a) => a.appKey).sort()).toEqual(['dsa', 'trading'])
    expect(m.deadlines).toEqual([]); expect(m.money).toBeNull()
  })
  it('a different daily goal changes the ring', () => {
    expect(buildHome(full({ dailyGoalMinutes: 61 })).header.ring.state).toBe('reached')
  })
  it('an overdue deadline is red with "overdue" text', () => {
    const m = buildHome(full({ deadlines: [{ ...v.taskflow_dashboard_deadlines[0]!, due_on: '2026-10-23', days_left: -2 }] }))
    expect(m.deadlines[0]).toMatchObject({ daysLeft: -2, tone: 'red', text: '2 d overdue' })
  })
  it('formatCents and readableApps', () => {
    expect(formatCents(214000)).toBe('$2,140'); expect(formatCents(46000, true)).toBe('+$460'); expect(formatCents(-5000, true)).toBe('-$50'); expect(formatCents(0, true)).toBe('$0')
    expect([...readableApps(health)].sort()).toEqual(['dsa', 'money', 'taskflow', 'trading'])
    expect(readableApps(none).size).toBe(0)
  })
})
