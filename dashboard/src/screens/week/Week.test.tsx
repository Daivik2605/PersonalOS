import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../../data/DataProvider'
import type { DashRow } from '../../data/source'
import { buildSampleOsViews, buildSampleViews } from '../../fixtures'
import type { OsViewRows, Settings } from '../../lib/contract'
import { fakeSource } from '../../testing/fakeSource'
import { Week } from './Week'

vi.mock('../../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const NOW = new Date('2026-10-25T19:00:00Z') // Sunday 15:00 in Toronto: this week Oct 19-25, last week Oct 12-18
const v = buildSampleViews('2026-10-25', NOW)
const os = buildSampleOsViews(v, '2026-10-25')

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

const allApps = (settings: Partial<Settings> | null = null) => {
  const src = fakeSource(os as OsViewRows, settings)
  src.state.dash = v as unknown as Record<string, DashRow[]>
  return src
}
const setup = (src = fakeSource()) => { render(<MemoryRouter><DataProvider sourceOverride={src}><Week /></DataProvider></MemoryRouter>); return src }
const row = (name: RegExp) => screen.getByRole('row', { name })

describe('Week, all four apps', () => {
  it('compares this week with last week using the hand-calculated numbers', async () => {
    setup(allApps())
    expect(await screen.findByRole('row', { name: /Productive time/ })).toBeInTheDocument()
    const prod = row(/Productive time/)
    expect(prod).toHaveTextContent('15h 13m'); expect(prod).toHaveTextContent('11h 53m'); expect(prod).toHaveTextContent('Up 3h 20m (28%)')
    const cig = row(/Cigarettes/)
    expect(cig).toHaveTextContent('23'); expect(cig).toHaveTextContent('24'); expect(cig).toHaveTextContent('Down 1 (4%)'); expect(cig).toHaveTextContent('(better)')
    expect(row(/Money in/)).toHaveTextContent('$0'); expect(row(/Money in/)).toHaveTextContent('$2,600'); expect(row(/Money in/)).toHaveTextContent('Down $2,600 (100%)')
    expect(row(/DSA items/)).toBeInTheDocument(); expect(row(/Charts studied/)).toBeInTheDocument()
    for (const group of ['Productive', 'TaskFlow', 'InteractiveDSA', 'Chart Journal', 'Money']) expect(screen.getByRole('table', { name: group })).toBeInTheDocument()
  })

  it('productive time by tag, weekly goals and the review link', async () => {
    setup(allApps())
    const tags = await screen.findByRole('region', { name: 'Productive time by tag' })
    expect(within(tags).getByRole('row', { name: /Study\/DSA/ })).toHaveTextContent('5h 31m')
    expect(within(tags).getByRole('row', { name: /Study\/DSA/ })).toHaveTextContent('4h 43m')
    const goals = await screen.findByRole('region', { name: 'Weekly goals' })
    expect(await within(goals).findByRole('progressbar', { name: 'Study' })).toHaveAttribute('aria-valuenow', '68')
    expect(within(goals).getByRole('progressbar', { name: 'Gym' })).toHaveAttribute('aria-valuenow', '67')
    expect(within(goals).getByText(/Last week: hit \(15h 50m/)).toBeInTheDocument()
    expect(within(goals).getByText(/Last week: no result/)).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Do the review in TaskFlow' })).toHaveAttribute('href', 'http://localhost:5175/review')
  })

  it('the daily bars card has a table with each day and the day off marked', async () => {
    setup(allApps())
    const card = await screen.findByRole('region', { name: 'Productive time per day' })
    await userEvent.click(within(card).getByRole('button', { name: 'Show as table' }))
    const rows = within(card).getAllByRole('row').slice(1)
    expect(rows).toHaveLength(7)
    expect(rows.map((r) => r.textContent).join('|')).toMatch(/2h 31m.*2h 20m.*2h 32m.*2h 15m.*2h 16m.*2h 18m.*1h 01m/)
  })

  it('asks the database only for the two weeks it shows', async () => {
    const src = setup(allApps())
    await screen.findByRole('row', { name: /Productive time/ })
    await screen.findByRole('region', { name: 'Weekly goals' })
    const calls = (name: string) => (src.view as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === name)
    for (const name of ['os_week', 'os_tag_daily', 'os_productive_daily']) {
      expect(calls(name).length).toBeGreaterThan(0)
      expect(calls(name).every((c) => c[1]?.since === '2026-10-12')).toBe(true)
    }
    const goalCalls = (src.dashboardView as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'taskflow_dashboard_goals')
    expect(goalCalls.every((c) => c[1]?.since === '2026-10-12')).toBe(true)
  })

  it('a week starting on Sunday moves both windows', async () => {
    // (the sample os_week rows are built for Monday weeks, so no rows match here; the query window is what is checked)
    const src = setup(allApps({ week_starts_on: 0 }))
    await screen.findByRole('link', { name: 'Do the review in TaskFlow' })
    const calls = (src.view as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === 'os_week')
    expect(calls.every((c) => c[1]?.since === '2026-10-18')).toBe(true) // today is Sunday Oct 25: this week Oct 25-31, last week Oct 18-24
  })

  it('hidden apps drop their rows', async () => {
    setup(allApps({ hidden_apps: ['money'] }))
    await screen.findByRole('row', { name: /Productive time/ })
    expect(screen.queryByRole('table', { name: 'Money' })).toBeNull()
  })
})

describe('Week, empty and partial', () => {
  it('zero apps: says so and queries no app view', async () => {
    const src = setup()
    expect(await screen.findByText(/No apps have published data yet, so there is nothing to compare/)).toBeInTheDocument()
    expect(screen.queryByRole('table')).toBeNull()
    expect(src.dashboardView).not.toHaveBeenCalled()
  })

  it('one app (Chart Journal): its rows only, goals say TaskFlow has not published', async () => {
    const src = fakeSource({
      os_contract_health: os.os_contract_health.filter((h) => h.app === 'trading'), os_apps_now: os.os_apps_now.filter((r) => r.app === 'trading'),
      os_week: os.os_week.filter((r) => r.app === 'trading' || r.app === 'os'),
    })
    setup(src)
    expect(await screen.findByRole('table', { name: 'Chart Journal' })).toBeInTheDocument()
    expect(screen.queryByRole('table', { name: 'TaskFlow' })).toBeNull(); expect(screen.queryByRole('table', { name: 'Money' })).toBeNull()
    expect(await screen.findByText(/TaskFlow hasn't published yet, so there are no goals to show/)).toBeInTheDocument()
    expect(src.dashboardView).not.toHaveBeenCalled()
  })

  it('a missing week is "No data", not 0', async () => {
    const src = allApps()
    src.state.views.os_week = os.os_week.filter((r) => !(r.app === 'dsa' && r.week_start === '2026-10-19'))
    setup(src)
    expect(await screen.findByRole('row', { name: /DSA items/ })).toHaveTextContent('No data')
  })

  it('shows the error instead of a blank screen', async () => {
    const src = fakeSource(); src.state.fail = true
    setup(src)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load the week: network down/)
  })
})
