import { render, screen, within, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../../data/DataProvider'
import { ViewMissingError, type DashRow } from '../../data/source'
import { buildSampleOsViews, buildSampleViews } from '../../fixtures'
import type { OsViewRows, Settings } from '../../lib/contract'
import { fakeSource } from '../../testing/fakeSource'
import { Home } from './Home'

vi.mock('../../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const NOW = new Date('2026-10-25T19:00:00Z') // Sunday 15:00 in Toronto
const TODAY = '2026-10-25'
const v = buildSampleViews(TODAY, NOW)
const os = buildSampleOsViews(v, TODAY)

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

function setup(src = fakeSource(), at = '/') {
  render(<MemoryRouter initialEntries={[at]}><DataProvider sourceOverride={src}><Home /></DataProvider></MemoryRouter>)
  return src
}
const allApps = (settings: Partial<Settings> | null = null) => {
  const src = fakeSource(os as OsViewRows, settings)
  src.state.dash = v as unknown as Record<string, DashRow[]>
  return src
}

describe('Home, all four apps', () => {
  it('fills every card with the numbers from the fixtures', async () => {
    setup(allApps())
    // header
    expect(await screen.findByRole('img', { name: 'Productive today: 1h 01m of 4h 00m' })).toBeInTheDocument()
    expect(screen.getByText('2h 59m left')).toBeInTheDocument()
    expect(screen.getByText('Behind pace')).toBeInTheDocument()
    expect(screen.getByText('13 days')).toBeInTheDocument()
    expect(await screen.findByText('7h 10m')).toBeInTheDocument() // Last night (TaskFlow's view loads after the os_ views)
    const today = screen.getByRole('region', { name: 'Today' })
    expect(await within(today).findByText('Cig 3')).toBeInTheDocument()
    expect(within(today).getByText('Weed 0')).toBeInTheDocument()
    // goals
    const goals = screen.getByRole('region', { name: 'Goals today' })
    expect(await within(goals).findByRole('link', { name: /DSA study 25m \/ 1h 00m/ })).toHaveAttribute('href', 'http://localhost:5175/timer?tag=Study%2FDSA')
    expect(within(goals).getByRole('link', { name: /Cigarettes 3 \/ 5 within limit/ })).toHaveAttribute('href', 'http://localhost:5175/goals')
    expect(within(goals).getByRole('progressbar', { name: 'Study' })).toHaveAttribute('aria-valuenow', '68')
    expect(within(goals).getByRole('progressbar', { name: 'Gym' })).toHaveAttribute('aria-valuenow', '67')
    // attention
    const att = screen.getByRole('region', { name: 'Needs attention' })
    expect(await within(att).findByRole('link', { name: /Weekly review due/ })).toHaveAttribute('href', 'http://localhost:5175/review')
    expect(within(att).getByRole('link', { name: /6 to categorise \/ review/ })).toHaveAttribute('href', 'http://localhost:5177')
    expect(within(att).getByRole('link', { name: /2 overdue tasks/ })).toHaveAttribute('href', 'http://localhost:5175/tasks?view=today')
    expect(within(att).getByRole('link', { name: /1 unchecked shifts/ })).toHaveAttribute('href', 'http://localhost:5175/work')
    // deadlines
    const dl = screen.getByRole('region', { name: 'Coming up' })
    expect((await within(dl).findByText('Pass G2')).closest('li')).toHaveAttribute('data-tone', 'red')
    expect(within(dl).getByText('Tableau exam').closest('li')).toHaveAttribute('data-tone', 'amber')
    expect(within(dl).getByText('Databricks exam').closest('li')).toHaveAttribute('data-tone', 'none')
    // money
    const money = await screen.findByRole('region', { name: 'Money' })
    expect(within(money).getByText('$2,140')).toBeInTheDocument()
    expect(within(money).getByText('+$460')).toBeInTheDocument()
    expect(within(money).getByText('$89')).toBeInTheDocument()
    // apps and quick links
    const apps = screen.getByRole('region', { name: 'Apps' })
    for (const n of ['Chart Journal', 'InteractiveDSA', 'TaskFlow', 'Money']) expect(within(apps).getByRole('link', { name: n })).toBeInTheDocument()
    expect(within(apps).getByText('Week 3 · Day 2 · 2 left today')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Quick links' })).getAllByRole('link')).toHaveLength(6)
    expect(screen.queryByText(/No apps have published/)).toBeNull()
  })

  it('a day off says "Day off" instead of a pace hint', async () => {
    const src = allApps()
    src.state.views.os_productive_daily = [...os.os_productive_daily.filter((p) => p.day !== TODAY), { user_id: 'u', day: TODAY, minutes: 0, is_day_off: true }]
    setup(src)
    expect(await screen.findByText('Day off')).toBeInTheDocument()
    expect(screen.queryByText('Behind pace')).toBeNull(); expect(screen.queryByText('On pace')).toBeNull()
  })

  it('money amounts are masked on the phone until tapped', async () => {
    const { container } = render(<MemoryRouter><DataProvider sourceOverride={allApps()}><Home /></DataProvider></MemoryRouter>)
    const money = await screen.findByRole('region', { name: 'Money' })
    expect(container.querySelectorAll('[data-mask]').length).toBe(4)
    await userEvent.click(within(money).getByRole('button', { name: 'Show amounts' }))
    expect(container.querySelectorAll('[data-mask]').length).toBe(0)
    await userEvent.click(within(money).getByRole('button', { name: 'Hide amounts' }))
    expect(container.querySelectorAll('[data-mask]').length).toBe(4)
  })

  it('hidden apps and the saved card order are respected', async () => {
    setup(allApps({ hidden_apps: ['money'], card_order: ['links', 'apps', 'goals', 'attention', 'deadlines', 'money'] }))
    await screen.findByRole('region', { name: 'Today' })
    expect(screen.queryByRole('region', { name: 'Money' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Apps' })).queryByRole('link', { name: 'Money' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Quick links' })).queryByRole('link', { name: 'Open Money' })).toBeNull()
    const order = screen.getAllByRole('region').map((r) => r.getAttribute('aria-label'))
    expect(order.indexOf('Quick links')).toBeLessThan(order.indexOf('Apps'))
    expect(order.indexOf('Apps')).toBeLessThan(order.indexOf('Goals today'))
  })

  it('a TaskFlow view that does not exist yet is "no data", not an outage', async () => {
    const src = allApps()
    src.dashboardView = vi.fn(async (name: string) => {
      if (name === 'taskflow_dashboard_goals') throw new ViewMissingError('relation does not exist')
      return (v as unknown as Record<string, DashRow[]>)[name] ?? []
    }) as typeof src.dashboardView
    setup(src)
    const goals = await screen.findByRole('region', { name: 'Goals today' })
    await waitFor(() => expect(within(goals).getByText(/No goals yet/)).toBeInTheDocument())
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('Home, empty and partial', () => {
  it('zero apps: every card has an honest empty state, and nothing is queried', async () => {
    const src = setup()
    expect(await screen.findByText(/No apps have published data yet\. See/)).toBeInTheDocument()
    expect(screen.getByRole('img', { name: 'Productive today: no data of 4h 00m' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today' })).getAllByText('No data').length).toBeGreaterThanOrEqual(4)
    expect(within(screen.getByRole('region', { name: 'Needs attention' })).getByText('No apps have published data yet.')).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Goals today' })).getByText(/TaskFlow hasn't published yet/)).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Coming up' })).getByText(/TaskFlow hasn't published yet/)).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'Money' })).toBeNull()
    expect(within(screen.getByRole('region', { name: 'Apps' })).getAllByText('Not published yet')).toHaveLength(4)
    expect(src.dashboardView).not.toHaveBeenCalled()
  })

  it('one app (Chart Journal): its numbers show, the rest say not published, only its views are read', async () => {
    const src = fakeSource({
      os_contract_health: os.os_contract_health.filter((h) => h.app === 'trading'),
      os_apps_now: os.os_apps_now.filter((r) => r.app === 'trading'),
      os_productive_daily: [{ user_id: 'u', day: TODAY, minutes: 25, is_day_off: false }],
    })
    setup(src)
    expect(await screen.findByRole('img', { name: 'Productive today: 25m of 4h 00m' })).toBeInTheDocument()
    expect(screen.getByText('3h 35m left')).toBeInTheDocument()
    const apps = screen.getByRole('region', { name: 'Apps' })
    expect(within(apps).getByText('4/6 charts today · 8-day streak')).toBeInTheDocument()
    expect(within(apps).getAllByText('Not published yet')).toHaveLength(3)
    expect(within(screen.getByRole('region', { name: 'Needs attention' })).getByRole('link', { name: /2 guesses to grade/ })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Today' })).getByText('Streak').nextSibling).toHaveTextContent('No data')
    expect(src.dashboardView).not.toHaveBeenCalled() // chart-journal's rows come from the os_ views; no other app is queried
  })

  it('shows the error instead of a blank screen when the database cannot be read', async () => {
    const src = fakeSource(); src.state.fail = true
    setup(src)
    expect(await screen.findByRole('alert')).toHaveTextContent(/Couldn't load Home: network down/)
  })
})
