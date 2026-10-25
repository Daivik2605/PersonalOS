import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../../data/DataProvider'
import type { DashRow } from '../../data/source'
import { buildSampleOsViews, buildSampleViews } from '../../fixtures'
import type { OsViewRows, Settings } from '../../lib/contract'
import { fakeSource } from '../../testing/fakeSource'
import { Trends } from './Trends'

vi.mock('../../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const NOW = new Date('2026-10-25T19:00:00Z') // Sunday Oct 25, 15:00 Toronto
const v = buildSampleViews('2026-10-25', NOW)
const os = buildSampleOsViews(v, '2026-10-25')

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

const allApps = (settings: Partial<Settings> | null = null) => {
  const src = fakeSource(os as OsViewRows, settings)
  src.state.dash = v as unknown as Record<string, DashRow[]>
  return src
}
const setup = (src = fakeSource(), at = '/trends') => { render(<MemoryRouter initialEntries={[at]}><DataProvider sourceOverride={src}><Trends /></DataProvider></MemoryRouter>); return src }
const viewCalls = (src: ReturnType<typeof fakeSource>, name: string) => (src.view as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === name)
const dashCalls = (src: ReturnType<typeof fakeSource>, name: string) => (src.dashboardView as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === name)
const table = async (name: string) => {
  const card = await screen.findByRole('region', { name })
  await userEvent.click(within(card).getByRole('button', { name: 'Show as table' }))
  return within(card)
}

describe('Trends, 30 days (the default)', () => {
  it('stats from the fixtures: 7-day average 2h 16m, best day, longest streak 13', async () => {
    setup(allApps())
    const stats = await screen.findByRole('group', { name: 'Stats' }).catch(() => screen.findByLabelText('Stats'))
    expect(await within(stats).findByText('2h 16m')).toBeInTheDocument()
    expect(within(stats).getByText('13 days')).toBeInTheDocument()
    expect(within(stats).getByText('Best day').nextSibling).not.toHaveTextContent('No data')
    expect(within(stats).getByText('30-day average').nextSibling).not.toHaveTextContent('No data')
  })

  it('productive time by tag: the table has the max-rule numbers, and sub-tags on request', async () => {
    setup(allApps())
    const t = await table('Productive time by tag')
    const last = t.getAllByRole('row').find((r) => r.textContent?.startsWith('Oct 25'))!
    expect(last).toHaveTextContent('1h 01m')
    const oct13 = t.getAllByRole('row').find((r) => r.textContent?.startsWith('Oct 13'))!
    expect(oct13).toHaveTextContent('1h 58m') // 55 (max-rule) + 23 + 40 under Study
    await userEvent.click(screen.getByRole('button', { name: 'By sub-tag' }))
    expect(within(screen.getByRole('region', { name: 'Productive time by tag' })).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(expect.arrayContaining(['Study/DSA', 'Study/Cert', 'Study/Trading', 'Hustle/Projects']))
  })

  it('heatmap: 30 cells, the day off is hatched, the last day is under half the goal', async () => {
    setup(allApps())
    const heat = await screen.findByRole('region', { name: 'Consistency, 30 days' })
    const cells = within(heat).getAllByRole('gridcell')
    expect(cells).toHaveLength(30)
    expect(cells.at(-1)).toHaveAttribute('data-level', '1')
    expect(cells.find((c) => c.getAttribute('data-day') === '2026-10-17')).toHaveAttribute('data-level', 'off')
    expect(cells.find((c) => c.getAttribute('data-day') === '2026-10-16')).toHaveAttribute('data-level', '2')
    expect(within(heat).getByText('Day off')).toBeInTheDocument()
  })

  it('balance, work and commute, tasks and counters are there', async () => {
    setup(allApps())
    const bal = await table('Balance')
    expect(bal.getAllByRole('row').find((r) => r.textContent?.startsWith('Oct 25'))).toHaveTextContent('7h 10m') // last night's sleep
    const work = await table('Work and commute per week')
    expect(work.getAllByRole('row').some((r) => /Oct 19.*38h 30m.*5h 00m/.test(r.textContent ?? ''))).toBe(true) // 2310 and 300 minutes
    await table('Tasks done and missed per week')
    const cig = await table(/Cigarettes per day/ as unknown as string).catch(() => table('Cigarettes per day'))
    expect(cig.getAllByRole('row').find((r) => r.textContent?.startsWith('Oct 25'))).toHaveTextContent('33.3')
    expect(screen.getByRole('region', { name: 'Weed per day' })).toBeInTheDocument()
  })

  it('every view is asked only for the days it shows (30 days: from Sep 25, one more than shown for the 30-day average; TaskFlow 6 days earlier)', async () => {
    const src = setup(allApps())
    await screen.findByRole('region', { name: 'Balance' })
    for (const name of ['os_tag_daily', 'os_productive_daily']) {
      const real = viewCalls(src, name).filter((c) => !c[1]?.earliest)
      expect(real.length).toBeGreaterThan(0)
      expect(real.every((c) => c[1]?.since === '2026-09-25')).toBe(true)
    }
    expect(viewCalls(src, 'os_productive_daily').some((c) => c[1]?.earliest === true)).toBe(true) // where my history starts: one row
    expect(viewCalls(src, 'os_week').every((c) => c[1]?.since === '2026-09-21')).toBe(true) // the Monday of that week
    const tf = dashCalls(src, 'taskflow_dashboard_daily')
    expect(tf.filter((c) => !c[1]?.earliest).every((c) => c[1]?.since === '2026-09-19')).toBe(true)
    expect(viewCalls(src, 'os_tag_daily').every((c) => c[1]?.since)).toBe(true) // never a whole-view read
  })
})

describe('Trends, other ranges', () => {
  it('14 days: the 30-day average says to pick a longer range; 14 cells; query from Oct 12', async () => {
    const src = setup(allApps(), '/trends?range=14d')
    const stats = await screen.findByLabelText('Stats')
    expect(await within(stats).findByText('choose 30 days or more')).toBeInTheDocument()
    expect(within(await screen.findByRole('region', { name: 'Consistency, 14 days' })).getAllByRole('gridcell')).toHaveLength(14)
    expect(viewCalls(src, 'os_tag_daily').every((c) => c[1]?.since === '2026-10-12')).toBe(true)
    expect(screen.getByRole('link', { name: '14 days' })).toHaveAttribute('aria-current', 'page')
  })

  it('90 days: weekly buckets starting on a Monday; heatmap has 90 cells; 90-day hand check of the last 14', async () => {
    const src = setup(allApps(), '/trends?range=90d')
    const heat = await screen.findByRole('region', { name: 'Consistency, 90 days' })
    const cells = within(heat).getAllByRole('gridcell')
    expect(cells).toHaveLength(90)
    expect(cells.slice(-14).map((c) => c.getAttribute('data-level'))).toEqual(['2', '1', '1', '1', '2', 'off', '1', '2', '2', '2', '2', '2', '2', '1'])
    const first = viewCalls(src, 'os_tag_daily')[0]![1].since as string
    expect(new Date(`${first}T12:00:00Z`).getUTCDay()).toBe(1)
    const t = await table('Productive time by tag')
    expect(t.getAllByRole('columnheader')[0]).toHaveTextContent('Week of')
    expect(t.getAllByRole('row').some((r) => r.textContent?.startsWith('Oct 19') && r.textContent.includes('15h 13m'))).toBe(true)
  })

  it('12 months: monthly buckets, a full year of heatmap, money charts, queries from the right day', async () => {
    const src = setup(allApps(), '/trends?range=12m')
    expect(within(await screen.findByRole('region', { name: 'Consistency, the year' })).getAllByRole('gridcell')).toHaveLength(365)
    const money = await table('Money in, out and net per month')
    expect(money.getAllByRole('row')).toHaveLength(1 + 12)
    expect(money.getAllByRole('row').at(-1)).toHaveTextContent('$2,600')
    await table('Essentials and discretionary spending')
    expect(viewCalls(src, 'os_tag_daily').every((c) => c[1]?.since === '2025-10-26')).toBe(true) // 365 days back covers the year heatmap
    expect(dashCalls(src, 'money_dashboard_monthly').every((c) => c[1]?.since === '2025-11-01')).toBe(true)
    const t = await table('Productive time by tag')
    expect(t.getAllByRole('columnheader')[0]).toHaveTextContent('Month')
    expect(t.getAllByRole('row')).toHaveLength(1 + 12)
  })

  it('an unknown range falls back to 30 days', async () => {
    setup(allApps(), '/trends?range=forever')
    expect(await screen.findByRole('region', { name: 'Consistency, 30 days' })).toBeInTheDocument()
  })
})

describe('Trends, empty and partial', () => {
  it('zero apps: says so, no app view queried, no charts', async () => {
    const src = setup()
    expect(await screen.findByText(/No apps have published data yet, so there are no trends/)).toBeInTheDocument()
    expect(src.dashboardView).not.toHaveBeenCalled()
    expect(await screen.findByText(/TaskFlow hasn't published yet/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Money in, out and net per month' })).toBeNull()
  })

  it('one app (Chart Journal): productive time and heatmap from its minutes; TaskFlow and Money charts absent', async () => {
    const src = fakeSource({
      os_contract_health: os.os_contract_health.filter((h) => h.app === 'trading'), os_apps_now: os.os_apps_now.filter((r) => r.app === 'trading'),
      os_tag_daily: os.os_tag_daily.filter((t) => t.app_key === 'trading'), os_productive_daily: [{ user_id: 'u', day: '2026-10-24', minutes: 35, is_day_off: false }, { user_id: 'u', day: '2026-10-25', minutes: 25, is_day_off: false }],
    })
    setup(src)
    const t = await table('Productive time by tag')
    expect(t.getAllByRole('row').some((r) => r.textContent?.startsWith('Oct 25') && r.textContent.includes('25m'))).toBe(true)
    expect(screen.getByText(/TaskFlow hasn't published yet/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Balance' })).toBeNull()
    expect(screen.queryByRole('region', { name: /Money/ })).toBeNull()
    expect(src.dashboardView).not.toHaveBeenCalled()
  })

  it('a counter the view has no column for gets no chart; money hidden in Settings stays hidden', async () => {
    const src = allApps({ hidden_apps: ['money'] })
    src.state.dash = { ...src.state.dash, taskflow_dashboard_daily: v.taskflow_dashboard_daily.map(({ weed: _w, ...r }) => r) as DashRow[] }
    setup(src, '/trends?range=12m')
    await screen.findByRole('region', { name: 'Cigarettes per day, weekly average' })
    expect(screen.queryByRole('region', { name: /^Weed/ })).toBeNull()
    expect(screen.queryByRole('region', { name: 'Money in, out and net per month' })).toBeNull()
    expect(dashCalls(src, 'money_dashboard_monthly')).toHaveLength(0)
  })

  it('shows the error instead of a blank screen', async () => {
    const src = fakeSource(); src.state.fail = true
    setup(src)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load trends: network down/)
  })
})
