import { describe, expect, it } from 'vitest'
import { APPS } from '../lib/apps'
import { addDays } from '../lib/time'
import { buildSampleOsViews, buildSampleViews, SAMPLE_DAYS, SAMPLE_HISTORY_DAYS } from './index'

const TODAY = '2026-10-25'
const v = buildSampleViews(TODAY, new Date('2026-10-25T15:00:00Z'))
const STD_DAILY = ['user_id', 'day', 'app', 'active_minutes', 'items_done', 'items_planned', 'streak_current', 'headline', 'updated_at']
const STD_NOW = ['user_id', 'app', 'contract_version', 'status_line', 'needs_attention', 'attention_label', 'last_activity_at', 'updated_at']

describe('sample fixtures match the contract', () => {
  const dailies = { trading: v.trading_dashboard_daily, taskflow: v.taskflow_dashboard_daily, dsa: v.dsa_dashboard_daily, money: v.money_dashboard_daily }
  const nows = { trading: v.trading_dashboard_now, taskflow: v.taskflow_dashboard_now, dsa: v.dsa_dashboard_now, money: v.money_dashboard_now }

  for (const [app, rows] of Object.entries(dailies)) {
    it(`${app}_dashboard_daily: standard columns first, in order, right types, unique days`, () => {
      expect(rows.length).toBeGreaterThan(0)
      for (const r of rows) {
        expect(Object.keys(r).slice(0, 9)).toEqual(STD_DAILY)
        expect(r.app).toBe(app)
        expect(Number.isInteger(r.active_minutes) && Number.isInteger(r.items_done)).toBe(true)
        expect(r.items_planned === null || Number.isInteger(r.items_planned)).toBe(true)
        expect(r.streak_current === null || Number.isInteger(r.streak_current)).toBe(true)
        expect(typeof r.headline).toBe('string')
        expect(r.day).toMatch(/^\d{4}-\d{2}-\d{2}$/)
        expect(Number.isNaN(Date.parse(r.updated_at))).toBe(false)
      }
      expect(new Set(rows.map((r) => r.day)).size).toBe(rows.length)
    })
  }
  for (const [app, rows] of Object.entries(nows)) {
    it(`${app}_dashboard_now: one row, standard columns first`, () => {
      expect(rows).toHaveLength(1)
      expect(Object.keys(rows[0]!).slice(0, 8)).toEqual(STD_NOW)
      expect(rows[0]!.app).toBe(app)
      expect(rows[0]!.contract_version).toBe(1)
    })
  }

  it('money is not time and has no plan or streak; others have the contract extras', () => {
    for (const r of v.money_dashboard_daily) expect([r.active_minutes, r.items_planned, r.streak_current]).toEqual([0, null, null])
    expect(Object.keys(v.taskflow_dashboard_daily[0]!)).toEqual(expect.arrayContaining(['work_minutes', 'sleep_minutes', 'cigarettes', 'weed', 'is_day_off', 'goals_hit', 'goals_total', 'mood', 'energy']))
    expect(Object.keys(v.trading_dashboard_now[0]!)).toEqual(expect.arrayContaining(['guess_accuracy_pct', 'paper_balance', 'challenge_day']))
    expect(Object.keys(v.dsa_dashboard_now[0]!)).toEqual(expect.arrayContaining(['plan_progress_pct', 'next_redo_on']))
    expect(Object.keys(v.money_dashboard_now[0]!)).toEqual(expect.arrayContaining(['month_net_cents', 'unknown_pct']))
  })

  it('covers the whole window up to today and the TaskFlow extra views', () => {
    const days = v.taskflow_dashboard_daily.map((r) => r.day)
    expect(days).toHaveLength(SAMPLE_HISTORY_DAYS)
    expect(days.at(-1)).toBe(TODAY)
    expect(days[0]).toBe(addDays(TODAY, -(SAMPLE_HISTORY_DAYS - 1)))
    const window = days.slice(-SAMPLE_DAYS) // the hand-checked 14 days
    expect(window[0]).toBe(addDays(TODAY, -(SAMPLE_DAYS - 1)))
    expect(v.taskflow_dashboard_days_off.map((d) => d.day).filter((d) => d >= window[0]!)).toEqual([window[5]])
    expect(v.taskflow_dashboard_days_off.length).toBeGreaterThan(10) // older history has days off too
    expect(v.taskflow_dashboard_deadlines.every((d) => d.hard_deadline && d.days_left >= 0)).toBe(true)
    expect(v.taskflow_dashboard_goals.some((g) => g.hit) && v.taskflow_dashboard_goals.some((g) => !g.hit)).toBe(true)
    expect(v.money_dashboard_monthly).toHaveLength(12)
  })
})

describe('sample os_ views', () => {
  const os = buildSampleOsViews(v)
  it('unions use the standard columns only', () => {
    expect(os.os_daily_activity.length).toBe(v.trading_dashboard_daily.length + v.taskflow_dashboard_daily.length + v.dsa_dashboard_daily.length + v.money_dashboard_daily.length)
    expect(Object.keys(os.os_daily_activity[0]!)).toEqual(STD_DAILY)
    expect(Object.keys(os.os_apps_now[0]!)).toEqual(STD_NOW)
  })
  it('shows all four apps healthy, in the unions', () => {
    expect(os.os_contract_health).toHaveLength(8)
    expect(os.os_contract_health.every((h) => h.exists && h.columns_ok && h.access_ok && h.in_unions)).toBe(true)
    expect(new Set(os.os_contract_health.map((h) => h.app))).toEqual(new Set(APPS.map((a) => a.dataKey)))
  })
})

describe('sample part-2 views (hand-calculated from the fixture arrays)', () => {
  const os = buildSampleOsViews(v)
  const prod = (day: string) => os.os_productive_daily.find((p) => p.day === day)
  it('area_daily has tag_path and never a null tag', () => {
    expect(v.taskflow_dashboard_area_daily.every((r) => r.tag && r.tag_path === (r.tag === r.parent_tag ? r.tag : `${r.parent_tag}/${r.tag}`))).toBe(true)
    expect(v.taskflow_dashboard_area_daily.some((r) => r.tag_path === 'Break')).toBe(true)
  })
  it('max-rule days: DSA 55 beats TaskFlow 53; the app gets the day off row too', () => {
    // 10-13: TaskFlow DSA round(75 x 0.7) = 53, DSA app 55 -> 55; Cert 23; trading 40 => 118
    expect(os.os_tag_daily.find((t) => t.day === '2026-10-13' && t.tag_path === 'Study/DSA')).toMatchObject({ minutes: 55, source: 'max' })
    expect(prod('2026-10-13')?.minutes).toBe(118)
    // 10-16: TaskFlow DSA 63 beats the app's 60 => 63 + Cert 27 + trading 50 = 140
    expect(os.os_tag_daily.find((t) => t.day === '2026-10-16' && t.tag_path === 'Study/DSA')).toMatchObject({ minutes: 63, source: 'taskflow' })
    expect(prod('2026-10-16')?.minutes).toBe(140)
    // 10-17 (day off): no TaskFlow study; trading 30 + DSA app 45 under the linked DSA tag
    expect(prod('2026-10-17')).toMatchObject({ minutes: 75, is_day_off: true })
    expect(os.os_tag_daily.find((t) => t.day === '2026-10-17' && t.app_key === 'dsa')).toMatchObject({ minutes: 45, source: 'app', tag_path: 'Study/DSA' })
  })
  it('the streak skips the day off: 14 days, one off = 13', () => {
    expect(os.os_streak).toEqual([expect.objectContaining({ current: 13, longest: 13, last_productive_day: TODAY })])
  })
  it('week of 10-12 productive minutes = 125 + 118 + 110 + 45 + 140 + 75 + 100 = 713, one day off', () => {
    const w = os.os_week.filter((r) => r.week_start === '2026-10-12' && r.app === 'os')
    expect(w.find((r) => r.metric === 'productive_minutes')?.value).toBe(713)
    expect(w.find((r) => r.metric === 'days_off')?.value).toBe(1)
  })
  it('money week sums and the TaskFlow extras are present', () => {
    const net = os.os_week.find((r) => r.week_start === '2026-10-12' && r.app === 'money' && r.metric === 'net_cents')
    const inn = os.os_week.find((r) => r.week_start === '2026-10-12' && r.app === 'money' && r.metric === 'in_cents')
    expect(inn?.value).toBe(260000) // one paycheque (day index 4)
    expect(net?.value).toBe(260000 - (0 + 4200 + 0 + 1850 + 12500 + 0 + 3300))
    expect(os.os_week.some((r) => r.app === 'taskflow' && r.metric === 'sleep_minutes')).toBe(true)
  })
  it('money fixtures use the names in money/docs/SPEC.md §9', () => {
    expect(Object.keys(v.money_dashboard_daily[0]!).slice(9)).toEqual(['out_cents', 'in_cents', 'essential_out_cents', 'discretionary_out_cents', 'smoking_out_cents'])
    expect(Object.keys(v.money_dashboard_monthly[0]!)).toEqual(['user_id', 'month', 'in_cents', 'out_cents', 'net_cents', 'essential_cents', 'discretionary_cents', 'by_category'])
    expect(Object.keys(v.money_dashboard_monthly[0]!.by_category).every((k) => k.includes('/') || k === 'Subscriptions')).toBe(true)
  })
  it('optional TaskFlow views are reported healthy', () => {
    expect(os.os_optional_health.every((h) => h.exists && h.columns_ok && h.access_ok && h.in_use)).toBe(true)
  })
})
