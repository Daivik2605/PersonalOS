import { describe, expect, it } from 'vitest'
import { APPS } from '../lib/apps'
import { addDays } from '../lib/time'
import { buildSampleOsViews, buildSampleViews, SAMPLE_DAYS } from './index'

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
    expect(days).toHaveLength(SAMPLE_DAYS)
    expect(days.at(-1)).toBe(TODAY)
    expect(days[0]).toBe(addDays(TODAY, -(SAMPLE_DAYS - 1)))
    expect(v.taskflow_dashboard_days_off.map((d) => d.day)).toEqual([days[5]])
    expect(v.taskflow_dashboard_deadlines.every((d) => d.hard_deadline && d.days_left >= 0)).toBe(true)
    expect(v.taskflow_dashboard_goals.some((g) => g.hit) && v.taskflow_dashboard_goals.some((g) => !g.hit)).toBe(true)
    expect(v.money_dashboard_monthly).toHaveLength(3)
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
