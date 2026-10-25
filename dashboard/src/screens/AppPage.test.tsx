import { render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../data/DataProvider'
import type { DashRow } from '../data/source'
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import type { OsViewRows } from '../lib/contract'
import { fakeSource } from '../testing/fakeSource'
import { AppPage } from './AppPage'

vi.mock('../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const NOW = new Date('2026-10-25T19:00:00Z')
const v = buildSampleViews('2026-10-25', NOW)
const os = buildSampleOsViews(v, '2026-10-25')

function setup(at: string, src = fakeSource(os as OsViewRows)) {
  src.state.dash = v as unknown as Record<string, DashRow[]>
  render(
    <MemoryRouter initialEntries={[at]}>
      <DataProvider sourceOverride={src}><Routes><Route path="/app/:key" element={<AppPage />} /><Route path="/" element={<p>Home page</p>} /></Routes></DataProvider>
    </MemoryRouter>,
  )
  return src
}

describe('AppPage', () => {
  it('shows every _now extra and every _daily column of a published app', async () => {
    setup('/app/dsa')
    expect(await screen.findByRole('heading', { name: 'InteractiveDSA' })).toBeInTheDocument()
    expect(await screen.findByText('Week 3 · Day 2 · 2 left today')).toBeInTheDocument()
    expect(screen.getByText(/Contract OK, contract v1/)).toBeInTheDocument()
    const table = await screen.findByRole('table')
    const nowSection = screen.getByRole('heading', { name: 'Now' }).nextElementSibling as HTMLElement
    for (const extra of ['week', 'day in week', 'plan progress pct', 'solved alone total', 'problems total', 'longest streak', 'next redo on']) expect(within(nowSection).getByText(extra)).toBeInTheDocument()
    const headers = within(table).getAllByRole('columnheader').map((h) => h.textContent)
    expect(headers.slice(0, 8)).toEqual(['day', 'app', 'active minutes', 'items done', 'items planned', 'streak current', 'headline', 'updated at'])
    expect(headers).toContain('quiz correct'); expect(headers).toContain('catchup queue size'); expect(headers).not.toContain('user id')
    expect(within(table).getAllByRole('row')).toHaveLength(1 + 30) // the last 30 days of a longer history, newest first
    expect(screen.getByRole('link', { name: 'Open InteractiveDSA' })).toHaveAttribute('href', 'http://localhost:5174')
  })

  it('TaskFlow lists its deep links', async () => {
    setup('/app/taskflow')
    expect(await screen.findByRole('link', { name: 'Weekly review' })).toHaveAttribute('href', 'http://localhost:5175/review')
    expect(screen.getByRole('link', { name: 'Goals' })).toHaveAttribute('href', 'http://localhost:5175/goals')
  })

  it('an unpublished app says so and reads nothing', async () => {
    const src = fakeSource({ ...os, os_contract_health: os.os_contract_health.filter((h) => h.app !== 'money'), os_apps_now: os.os_apps_now.filter((r) => r.app !== 'money') } as OsViewRows)
    setup('/app/money', src)
    expect(await screen.findByText(/Not published yet\. This app has not published/)).toBeInTheDocument()
    expect(src.dashboardView).not.toHaveBeenCalled()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('an unknown app goes back to Home', async () => {
    setup('/app/nope')
    expect(await screen.findByText('Home page')).toBeInTheDocument()
  })
})
