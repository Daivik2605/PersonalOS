// @vitest-environment node
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { applySince, dashSinceColumn, isDashboardView, osSinceColumn, PAGE, supabaseSource, ViewMissingError } from './source'

interface Call { table: string; gte: [string, string][]; order: [string, boolean][]; range: [number, number][] }
/** A stand-in for the Supabase client that records the query and answers pages from a script. */
function fakeClient(pages: (unknown[] | { error: { code?: string; message: string } })[]) {
  const calls: Call[] = []
  let page = 0
  const client = {
    from(table: string) {
      const c: Call = { table, gte: [], order: [], range: [] }
      calls.push(c)
      const b = {
        select: () => b,
        gte: (col: string, v: string) => { c.gte.push([col, v]); return b },
        order: (col: string, o: { ascending: boolean }) => { c.order.push([col, o.ascending]); return b },
        range: (a: number, z: number) => {
          c.range.push([a, z])
          const next = pages[Math.min(page++, pages.length - 1)]!
          return Promise.resolve(Array.isArray(next) ? { data: next, error: null } : { data: null, error: next.error })
        },
      }
      return b
    },
  }
  return { client: client as unknown as SupabaseClient, calls }
}
const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ i }))

describe('the database is asked only for the date range shown', () => {
  it('os_tag_daily and os_productive_daily filter on day >= since in the query', async () => {
    for (const name of ['os_tag_daily', 'os_productive_daily'] as const) {
      const { client, calls } = fakeClient([[]])
      await supabaseSource(client, 'u').view(name, { since: '2026-09-26' })
      expect(calls[0]!.gte).toEqual([['day', '2026-09-26']])
    }
  })
  it('os_week filters on week_start; a view with no date column is read whole', async () => {
    const w = fakeClient([[]]); await supabaseSource(w.client, 'u').view('os_week', { since: '2026-10-12' })
    expect(w.calls[0]!.gte).toEqual([['week_start', '2026-10-12']])
    const s = fakeClient([[]]); await supabaseSource(s.client, 'u').view('os_streak', { since: '2026-10-12' })
    expect(s.calls[0]!.gte).toEqual([])
  })
  it('taskflow_dashboard_daily, goals and monthly filter on their own date column', async () => {
    const d = fakeClient([[]]); await supabaseSource(d.client, 'u').dashboardView('taskflow_dashboard_daily', { since: '2026-09-26' })
    expect(d.calls[0]!.gte).toEqual([['day', '2026-09-26']])
    const g = fakeClient([[]]); await supabaseSource(g.client, 'u').dashboardView('taskflow_dashboard_goals', { since: '2026-10-12' })
    expect(g.calls[0]!.gte).toEqual([['period_end', '2026-10-12']])
    const m = fakeClient([[]]); await supabaseSource(m.client, 'u').dashboardView('money_dashboard_monthly', { since: '2025-11-01' })
    expect(m.calls[0]!.gte).toEqual([['month', '2025-11-01']])
  })
  it('no since: no filter (small views like os_streak); days is shorthand for since', async () => {
    const a = fakeClient([[]]); await supabaseSource(a.client, 'u').view('os_tag_daily')
    expect(a.calls[0]!.gte).toEqual([])
    const b = fakeClient([[]]); await supabaseSource(b.client, 'u').dashboardView('taskflow_dashboard_daily', { days: 8 })
    expect(b.calls[0]!.gte).toHaveLength(1); expect(b.calls[0]!.gte[0]![0]).toBe('day')
  })
  it('earliest reads exactly one row, oldest first', async () => {
    const { client, calls } = fakeClient([[{ day: '2026-01-01' }]])
    const r = await supabaseSource(client, 'u').view('os_productive_daily', { earliest: true })
    expect(r).toEqual([{ day: '2026-01-01' }])
    expect(calls[0]).toMatchObject({ order: [['day', true]], range: [[0, 0]] })
    const d = fakeClient([[{ day: '2026-01-01' }]]); await supabaseSource(d.client, 'u').dashboardView('taskflow_dashboard_daily', { earliest: true })
    expect(d.calls[0]).toMatchObject({ order: [['day', true]], range: [[0, 0]] })
  })
})

describe('paging happens only when a range is bigger than one page', () => {
  it('a range under 1000 rows is one request', async () => {
    const { client, calls } = fakeClient([rows(250)])
    expect(await supabaseSource(client, 'u').view('os_tag_daily', { since: '2026-01-01' })).toHaveLength(250)
    expect(calls[0]!.range).toEqual([[0, PAGE - 1]])
  })
  it('exactly 1000 rows asks once more; a bigger range pages until a short page', async () => {
    const { client, calls } = fakeClient([rows(PAGE), rows(PAGE), rows(37)])
    expect(await supabaseSource(client, 'u').view('os_tag_daily', { since: '2025-01-01' })).toHaveLength(2 * PAGE + 37)
    expect(calls).toHaveLength(3)
    expect(calls.map((c) => c.range[0])).toEqual([[0, PAGE - 1], [PAGE, 2 * PAGE - 1], [2 * PAGE, 3 * PAGE - 1]])
    expect(calls.every((c) => c.gte[0]![1] === '2025-01-01')).toBe(true) // every page keeps the filter
  })
})

describe('errors and names', () => {
  it('a view that does not exist is a ViewMissingError, any other failure a plain Error', async () => {
    const missing = fakeClient([{ error: { code: 'PGRST205', message: 'not found' } }])
    await expect(supabaseSource(missing.client, 'u').dashboardView('taskflow_dashboard_goals')).rejects.toBeInstanceOf(ViewMissingError)
    const other = fakeClient([{ error: { code: '42501', message: 'permission denied' } }])
    await expect(supabaseSource(other.client, 'u').dashboardView('taskflow_dashboard_goals')).rejects.toThrow('permission denied')
  })
  it('only registered apps\' dashboard views can be read', async () => {
    const { client, calls } = fakeClient([[]])
    await expect(supabaseSource(client, 'u').dashboardView('taskflow_tasks')).rejects.toThrow(/Not a dashboard view/)
    await expect(supabaseSource(client, 'u').dashboardView('os_settings')).rejects.toThrow()
    expect(calls).toHaveLength(0)
    expect(isDashboardView('money_dashboard_monthly')).toBe(true); expect(isDashboardView('other_dashboard_daily')).toBe(false)
  })
  it('column helpers and applySince behave like the database cut', () => {
    expect(osSinceColumn('os_week')).toBe('week_start'); expect(osSinceColumn('os_streak')).toBeNull()
    expect(dashSinceColumn('taskflow_dashboard_now')).toBeNull(); expect(dashSinceColumn('taskflow_dashboard_area_daily')).toBe('day')
    const r = [{ day: '2026-01-01' }, { day: '2026-02-01' }, { day: '2026-03-01' }]
    expect(applySince(r, 'day', { since: '2026-02-01' })).toHaveLength(2)
    expect(applySince(r, 'day', { earliest: true })).toEqual([{ day: '2026-01-01' }])
    expect(applySince(r, null, { since: '2030-01-01' })).toHaveLength(3)
  })
})
