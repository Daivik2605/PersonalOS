// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import type { ProductiveDailyRow } from './contract'
import type { Row } from './home'
import { addDays } from './time'
import {
  averageProductive, balanceSeries, bucketKey, counterSeries, heatGrid, heatLevel, heatmap, makeBuckets, moneySeries, parseRange, rangeWindow,
  stackedProductive, trendStats, weeklySeries,
} from './trends'

const TODAY = '2026-10-25' // a Sunday
const v = buildSampleViews(TODAY, new Date('2026-10-25T19:00:00Z'))
const os = buildSampleOsViews(v, TODAY)
const prod = (day: string, minutes: number, off = false): ProductiveDailyRow => ({ user_id: '', day, minutes, is_day_off: off })

describe('rangeWindow: each view is asked only for the days it shows', () => {
  it('14 and 30 days: daily, from exactly the first shown day (os views), 6 more days for the trailing average (TaskFlow)', () => {
    const w14 = rangeWindow('14d', TODAY)
    expect(w14).toMatchObject({ granularity: 'day', shownStart: addDays(TODAY, -13), osStart: addDays(TODAY, -13), heatStart: addDays(TODAY, -13) })
    expect(w14.tfStart).toBe(addDays(w14.osStart, -6))
  })
  it('30 days reads one day more than it shows, because the 30-day average is over the 30 days before today', () => {
    const w = rangeWindow('30d', TODAY)
    expect(w).toMatchObject({ granularity: 'day', shownStart: addDays(TODAY, -29), heatStart: addDays(TODAY, -29), osStart: addDays(TODAY, -30) })
    expect(w.tfStart).toBe(addDays(TODAY, -36))
  })
  it('90 days: weekly buckets, so the first one starts on a week start (Monday, or Sunday when chosen)', () => {
    const w = rangeWindow('90d', TODAY)
    expect(w.shownStart).toBe(addDays(TODAY, -89))
    expect(w.granularity).toBe('week')
    expect(w.osStart <= w.shownStart && w.osStart > addDays(w.shownStart, -7)).toBe(true)
    expect(new Date(`${w.osStart}T12:00:00Z`).getUTCDay()).toBe(1)
    expect(new Date(`${rangeWindow('90d', TODAY, 0).osStart}T12:00:00Z`).getUTCDay()).toBe(0)
  })
  it('12 months: monthly buckets from the first of the month 11 months ago, but a full 365 days for the heatmap', () => {
    const w = rangeWindow('12m', TODAY)
    expect(w).toMatchObject({ granularity: 'month', shownStart: '2025-11-01', monthStart: '2025-11-01', heatStart: addDays(TODAY, -364) })
    expect(w.osStart).toBe(addDays(TODAY, -364)) // earlier of the two
  })
  it('an unknown range falls back to 30 days', () => {
    expect(parseRange('90d')).toBe('90d'); expect(parseRange('nope')).toBe('30d'); expect(parseRange(null)).toBe('30d')
  })
})

describe('buckets', () => {
  it('days, weeks (across the November DST change) and months', () => {
    expect(makeBuckets('2026-10-30', '2026-11-03', 'day').map((b) => b.key)).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03'])
    expect(makeBuckets('2026-10-28', '2026-11-04', 'week').map((b) => [b.key, b.end])).toEqual([['2026-10-26', '2026-11-01'], ['2026-11-02', '2026-11-08']])
    expect(makeBuckets('2026-10-28', '2026-11-04', 'week', 0).map((b) => b.key)).toEqual(['2026-10-25', '2026-11-01'])
    expect(makeBuckets('2025-11-01', TODAY, 'month')).toHaveLength(12)
    expect(makeBuckets('2025-11-01', TODAY, 'month')[0]).toMatchObject({ key: '2025-11-01', label: 'Nov', end: '2025-11-30' })
    expect(bucketKey('2026-03-08', 'week')).toBe('2026-03-02') // the March change
  })
})

describe('stackedProductive (max-rule already applied)', () => {
  const buckets = makeBuckets(addDays(TODAY, -13), TODAY, 'day')
  const d = stackedProductive(os.os_tag_daily, buckets, 'day')
  it('parent tags, biggest first; Chart Journal minutes with no TaskFlow tag land under Study', () => {
    expect(d.series).toEqual(['Study', 'Hustle'])
    expect(d.rows.find((r) => r.key === '2026-10-12')).toMatchObject({ Study: 95, Hustle: 30, total: 125 })
    expect(d.rows.find((r) => r.key === '2026-10-13')).toMatchObject({ Study: 118, Hustle: 0, total: 118 }) // TaskFlow DSA raised to 55 + Cert 23 + trading 40
    expect(d.rows.find((r) => r.key === TODAY)).toMatchObject({ total: 61 })
  })
  it('work, wellness and break time are not productive', () => {
    expect(d.series).not.toContain('Work'); expect(d.series).not.toContain('Wellness')
  })
  it('weekly buckets sum the days; sub-tag level uses the full tag path', () => {
    const w = stackedProductive(os.os_tag_daily, makeBuckets('2026-10-19', TODAY, 'week'), 'week')
    expect(w.rows).toHaveLength(1); expect(w.rows[0]!.total).toBe(913)
    const sub = stackedProductive(os.os_tag_daily, makeBuckets('2026-10-19', TODAY, 'week'), 'week', 1, 'sub')
    expect(sub.series).toEqual(expect.arrayContaining(['Study/DSA', 'Study/Cert', 'Study/Trading', 'Hustle/Projects']))
    expect(sub.rows[0]!['Study/DSA']).toBe(331)
  })
  it('rows outside the buckets are ignored', () => {
    expect(stackedProductive(os.os_tag_daily, makeBuckets(TODAY, TODAY, 'day'), 'day').rows).toHaveLength(1)
  })
})

describe('heatmap', () => {
  it('levels: off wins, before the first day is none, none is 0, under half / under goal / reached', () => {
    expect(heatLevel(300, 240, true, false)).toBe('off'); expect(heatLevel(10, 240, false, true)).toBe('none')
    expect(heatLevel(0, 240, false, false)).toBe(0); expect(heatLevel(119, 240, false, false)).toBe(1)
    expect(heatLevel(120, 240, false, false)).toBe(2); expect(heatLevel(239, 240, false, false)).toBe(2); expect(heatLevel(240, 240, false, false)).toBe(3)
  })
  const firstDay = os.os_productive_daily[0]!.day
  const cells = heatmap(os.os_productive_daily, addDays(TODAY, -89), TODAY, 240, firstDay)
  it('90 days: one cell per day, the last 14 match the hand-calculated minutes and levels (goal 240)', () => {
    expect(cells).toHaveLength(90)
    const last14 = cells.slice(-14)
    expect(last14.map((c) => c.minutes)).toEqual([125, 118, 110, 45, 140, 75, 100, 151, 140, 152, 135, 136, 138, 61])
    expect(last14.map((c) => c.level)).toEqual([2, 1, 1, 1, 2, 'off', 1, 2, 2, 2, 2, 2, 2, 1])
  })
  it('a different goal changes the levels; days before the first row are "none", not misses', () => {
    expect(heatmap(os.os_productive_daily, addDays(TODAY, -13), TODAY, 100, firstDay).slice(-14).map((c) => c.level)).toEqual([3, 3, 3, 1, 3, 'off', 3, 3, 3, 3, 3, 3, 3, 2])
    expect(heatmap([prod('2026-10-20', 50)], '2026-10-18', '2026-10-22', 100, '2026-10-20').map((c) => c.level)).toEqual(['none', 'none', 2, 0, 0])
    expect(heatmap([], '2026-10-18', '2026-10-19', 100, null).map((c) => c.level)).toEqual(['none', 'none'])
  })
  it('the grid has weeks as columns, week-start days on top, padded at the ends', () => {
    const g = heatGrid(heatmap([], '2026-10-21', '2026-10-27', 100, '2026-10-01')) // Wed .. Tue
    expect(g).toHaveLength(2)
    expect(g[0]!.map((c) => c?.day ?? null)).toEqual([null, null, '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25'])
    expect(g[1]!.map((c) => c?.day ?? null)).toEqual(['2026-10-26', '2026-10-27', null, null, null, null, null])
  })
})

describe('stats', () => {
  const rows = os.os_productive_daily
  const first = rows[0]!.day
  const start = addDays(TODAY, -89)
  const s = trendStats(rows, TODAY, 1, start, first, 13)
  it('7-day average: the 7 days before today, days off excluded (952 / 7 = 136)', () => {
    expect(s.avg7).toBe(136)
  })
  it('30-day average matches an independent recount; best day and best week too', () => {
    const inWin = rows.filter((r) => r.day >= start)
    const days30 = Array.from({ length: 30 }, (_, k) => addDays(TODAY, -(k + 1))).filter((d) => !rows.find((r) => r.day === d)?.is_day_off)
    const sum = days30.reduce((a, d) => a + (rows.find((r) => r.day === d)?.minutes ?? 0), 0)
    expect(s.avg30).toBe(Math.round(sum / days30.length))
    expect(s.bestDay).toEqual({ day: inWin.reduce((a, b) => (b.minutes > a.minutes ? b : a)).day, minutes: Math.max(...inWin.map((r) => r.minutes)) })
    expect(s.longestStreak).toBe(13)
    expect(s.bestWeek!.weekStart <= addDays(TODAY, -7)).toBe(true) // the running week is never "best"
  })
  it('the 30-day average needs the window to reach back 30 days (14-day range: none)', () => {
    expect(trendStats(rows, TODAY, 1, addDays(TODAY, -13), first, 13)).toMatchObject({ avg30: null, avg7: 136 })
  })
  it('days before the first row are not zeros; a day with no row after it counts 0', () => {
    // first row on the 22nd: the 22nd, 23rd and 24th are counted (60, 0, 0) = 20; the four days before it are skipped
    expect(averageProductive([prod('2026-10-22', 60)], 7, TODAY, '2026-10-01', '2026-10-22')).toBe(20)
  })
  it('days off are left out of the average', () => {
    expect(averageProductive([prod('2026-10-22', 60), prod('2026-10-23', 0, true)], 7, TODAY, '2026-10-01', '2026-10-22')).toBe(30) // (60 + 0) / 2
  })
  it('nothing to average gives null, never 0', () => {
    expect(averageProductive([], 7, TODAY, '2026-10-01', null)).toBeNull()
    expect(averageProductive([prod('2026-10-25', 60)], 7, TODAY, '2026-10-01', TODAY)).toBeNull() // started today
  })
})

describe('balance and counters', () => {
  const tf = v.taskflow_dashboard_daily as Row[]
  it('week bucket: sleep averaged over nights, nap + reset over the week (rest: 35 on two days of seven)', () => {
    const b = balanceSeries(tf, makeBuckets('2026-10-19', TODAY, 'week'), 'week')
    expect(b).toEqual([{ key: '2026-10-19', label: 'Oct 19', wellness: 30, break: 40, sleep: 449, rest: 10 }])
  })
  it('day bucket is the day itself; a zero sleep night is no data', () => {
    expect(balanceSeries(tf, makeBuckets(TODAY, TODAY, 'day'), 'day')[0]).toMatchObject({ sleep: 430, wellness: 30, rest: 0 })
    expect(balanceSeries([{ day: TODAY, sleep_minutes: 0 }], makeBuckets(TODAY, TODAY, 'day'), 'day')[0]).toMatchObject({ sleep: null, wellness: null, rest: null })
  })
  it('counters per day with a trailing 7-day average; weekly points are the per-day average', () => {
    const days = counterSeries(tf, 'cigarettes', makeBuckets(addDays(TODAY, -2), TODAY, 'day'), 'day', os.os_productive_daily[0]!.day)
    expect(days.map((p) => p.value)).toEqual([4, 2, 3]) // 10-23, 10-24, 10-25
    expect(days.at(-1)).toMatchObject({ value: 3, avg7: 3.3 })
    const week = counterSeries(tf, 'cigarettes', makeBuckets('2026-10-19', TODAY, 'week'), 'week', '2020-01-01')
    expect(week[0]!.value).toBe(3.3)
  })
  it('before TaskFlow started a counter is null, not 0', () => {
    const p = counterSeries([{ day: '2026-10-24', cigarettes: 2 }], 'cigarettes', makeBuckets('2026-10-22', '2026-10-25', 'day'), 'day', '2026-10-24')
    expect(p.map((x) => x.value)).toEqual([null, null, 2, 0])
    expect(p[2]!.avg7).toBe(2); expect(p[3]!.avg7).toBe(1)
  })
})

describe('weekly series and money', () => {
  it('work and commute per week come from os_week; a week with no row is null', () => {
    const specs = [{ key: 'work', app: 'taskflow', metric: 'work_minutes', label: 'Work' }, { key: 'commute', app: 'taskflow', metric: 'commute_minutes', label: 'Commute' }]
    const r = weeklySeries(os.os_week, '2026-10-19', TODAY, specs)
    expect(r).toEqual([{ key: '2026-10-19', label: 'Oct 19', work: 2310, commute: 300 }]) // 450 + 480 + 450 + 480 + 450 and 60 per shift
    expect(weeklySeries([], '2026-10-19', TODAY, specs)[0]).toMatchObject({ work: null, commute: null })
  })
  it('money per month in dollars, oldest first, from the first month shown', () => {
    const m = moneySeries(v.money_dashboard_monthly, '2025-11-01')
    expect(m).toHaveLength(12)
    expect(m.at(-1)).toMatchObject({ in: 2600, out: 2140, net: 460, essential: 1380, discretionary: 760 })
    expect(moneySeries(v.money_dashboard_monthly, addDays(TODAY, -40)).length).toBeLessThan(12)
  })
})
