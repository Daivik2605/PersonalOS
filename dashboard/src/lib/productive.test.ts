// @vitest-environment node
// The same cases as supabase/tests/scenarios_p3.sql: the SQL runs against the real data, this runs the sample data.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { DailyRow, ProductiveDailyRow, TaskflowAreaDailyRow } from './contract'
import { APP_KINDS, minutesByKind, productiveDaily, productiveOn, streak, tagDaily } from './productive'
import { addDays } from './time'

const U = 'u'
const area = (day: string, parent: string, tag: string, kind: string, appKey: string | null, minutes: number): TaskflowAreaDailyRow =>
  ({ user_id: U, day, parent_tag: parent, tag, tag_path: tag === parent ? tag : `${parent}/${tag}`, kind, app_key: appKey, minutes })
const app = (appKey: string, day: string, minutes: number): DailyRow =>
  ({ user_id: U, day, app: appKey, active_minutes: minutes, items_done: 1, items_planned: null, streak_current: null, headline: '', updated_at: '' })
const find = (rows: ReturnType<typeof tagDaily>, day: string, path: string) => rows.find((r) => r.day === day && r.tag_path === path)

describe('tagDaily: the max-rule', () => {
  it('no TaskFlow at all: app minutes only, as Study/<label> with source app', () => {
    const rows = tagDaily([], [app('trading', '2026-10-20', 30), app('dsa', '2026-10-20', 45)])
    expect(rows).toHaveLength(2)
    expect(find(rows, '2026-10-20', 'Study/Trading')).toMatchObject({ parent_tag: 'Study', tag: 'Trading', kind: 'study', minutes: 30, source: 'app', app_key: 'trading' })
    expect(find(rows, '2026-10-20', 'Study/DSA')).toMatchObject({ tag: 'DSA', minutes: 45, source: 'app' })
  })

  const base = [
    area('2026-10-20', 'Study', 'DSA', 'study', 'dsa', 40), area('2026-10-20', 'Study', 'Cert', 'study', null, 30),
    area('2026-10-20', 'Work', 'Oland', 'work', null, 450), area('2026-10-20', 'Break', 'Break', 'break', null, 20),
    area('2026-10-21', 'Study', 'DSA', 'study', 'dsa', 70),
    area('2026-10-23', 'Study', 'Cert', 'study', null, 25), area('2026-10-23', 'Hustle', 'Projects', 'hustle', null, 15),
    area('2026-10-01', 'Study', 'OldDSA', 'study', 'dsa', 10),
  ]
  const apps = [app('dsa', '2026-10-20', 55), app('trading', '2026-10-20', 30), app('dsa', '2026-10-21', 55), app('dsa', '2026-10-22', 50), app('dsa', '2026-10-23', 20)]
  const rows = tagDaily(base, apps)

  it('TaskFlow Study/DSA 40 + DSA app 55 = 55, not 95', () => {
    expect(find(rows, '2026-10-20', 'Study/DSA')).toMatchObject({ minutes: 55, source: 'max', parent_tag: 'Study', tag: 'DSA' })
  })
  it('an unlinked tag keeps its TaskFlow minutes', () => {
    expect(find(rows, '2026-10-20', 'Study/Cert')).toMatchObject({ minutes: 30, source: 'taskflow' })
  })
  it('trading minutes with no TaskFlow tag are Study/Trading', () => {
    expect(find(rows, '2026-10-20', 'Study/Trading')).toMatchObject({ minutes: 30, source: 'app', tag: 'Trading' })
  })
  it('TaskFlow wins when it measured more (70 vs 55)', () => {
    expect(find(rows, '2026-10-21', 'Study/DSA')).toMatchObject({ minutes: 70, source: 'taskflow' })
  })
  it('app minutes on a day with no TaskFlow row go under the linked tag (the most recently used one, not the archived OldDSA)', () => {
    expect(find(rows, '2026-10-22', 'Study/DSA')).toMatchObject({ minutes: 50, source: 'app', tag: 'DSA' })
    expect(find(rows, '2026-10-22', 'Study/OldDSA')).toBeUndefined()
    expect(find(rows, '2026-10-23', 'Study/DSA')).toMatchObject({ minutes: 20, source: 'app' })
  })
  it('an archived tag with the same app_key is just a TaskFlow row', () => {
    expect(find(rows, '2026-10-01', 'Study/OldDSA')).toMatchObject({ minutes: 10, source: 'taskflow' })
  })
  it('a parent-level tag has tag = parent and tag_path = parent', () => {
    expect(find(rows, '2026-10-20', 'Break')).toMatchObject({ parent_tag: 'Break', tag: 'Break', tag_path: 'Break' })
  })
  it('an app with no kind (taskflow, money) never adds minutes', () => {
    const r = tagDaily([], [app('taskflow', '2026-10-20', 99), app('money', '2026-10-20', 0)])
    expect(r).toEqual([])
  })
  it('rows for the same tag and day are summed', () => {
    const r = tagDaily([area('2026-10-20', 'Study', 'Cert', 'study', null, 10), area('2026-10-20', 'Study', 'Cert', 'study', null, 15)], [])
    expect(r).toHaveLength(1)
    expect(r[0]!.minutes).toBe(25)
  })

  it('productive days: study + hustle only (work, break excluded)', () => {
    const p = productiveDaily(rows, [])
    expect(productiveOn(p, '2026-10-20')).toBe(55 + 30 + 30)
    expect(productiveOn(p, '2026-10-21')).toBe(70)
    expect(productiveOn(p, '2026-10-22')).toBe(50)
    expect(productiveOn(p, '2026-10-23')).toBe(25 + 15 + 20)
    expect(productiveOn(p, '2026-10-24')).toBe(0)
    expect(minutesByKind(rows)).toMatchObject({ work: 450, break: 20 })
  })
  it('a day off with no minutes still gets a row', () => {
    expect(productiveDaily([], [{ day: '2026-10-26' }])).toEqual([{ user_id: '', day: '2026-10-26', minutes: 0, is_day_off: true }])
  })
})

describe('streak', () => {
  const T = '2026-10-25'
  const days = (offsets: number[], extra: Partial<ProductiveDailyRow> = {}): ProductiveDailyRow[] =>
    offsets.map((n) => ({ user_id: '', day: addDays(T, -n), minutes: 30, is_day_off: false, ...extra }))
  const off = (n: number, minutes = 0): ProductiveDailyRow => ({ user_id: '', day: addDays(T, -n), minutes, is_day_off: true })

  it('a day off bridges a streak: 6 productive days across a day off = 6', () => {
    expect(streak([...days([0, 1, 2, 4, 5, 6]), off(3)], T)).toMatchObject({ current: 6, longest: 6, last_productive_day: T })
  })
  it('today at 0 does not break it', () => {
    expect(streak(days([1, 2, 3]), T)).toMatchObject({ current: 3, longest: 3, last_productive_day: addDays(T, -1) })
  })
  it('a missed day breaks it: current 1, longest 3', () => {
    expect(streak(days([1, 3, 4, 5]), T)).toMatchObject({ current: 1, longest: 3 })
  })
  it('yesterday at 0 means current 0 and the longest is kept', () => {
    expect(streak(days([3, 4, 5]), T)).toMatchObject({ current: 0, longest: 3, last_productive_day: addDays(T, -3) })
  })
  it('minutes on a day off neither extend nor break', () => {
    expect(streak([...days([0, 1, 3]), off(2, 40)], T)).toMatchObject({ current: 3, longest: 3 })
  })
  it('a streak that began today is 1; no productive day ever is null', () => {
    expect(streak(days([0]), T)).toMatchObject({ current: 1, longest: 1 })
    expect(streak([], T)).toBeNull()
    expect(streak([off(1)], T)).toBeNull()
  })
  it('across the November DST change days are still consecutive', () => {
    expect(streak(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'].map((day) => ({ user_id: '', day, minutes: 30, is_day_off: false })), '2026-11-02'))
      .toMatchObject({ current: 4, longest: 4 })
  })
  it('today productive after a day-off-bridged run extends it', () => {
    expect(streak([...days([0, 2]), off(1)], T)).toMatchObject({ current: 2 })
  })
})

describe('TypeScript and SQL agree', () => {
  const sql = readFileSync(new URL('../../../supabase/os_core.sql', import.meta.url), 'utf8')
  it('os_app_kind has the same apps, kinds and labels as APP_KINDS', () => {
    const m = sql.match(/from \(values (.*?)\) k\(app, kind, label\)/s)
    expect(m).not.toBeNull()
    const rows = [...m![1]!.matchAll(/\('(\w+)', '(\w+)', '(\w+)'\)/g)].map((x) => [x[1], { kind: x[2], label: x[3] }])
    expect(Object.fromEntries(rows)).toEqual(APP_KINDS)
  })
  it('productive kinds are study and hustle in the SQL too', () => {
    expect(sql).toContain("where kind in ('study', 'hustle')")
  })
})
