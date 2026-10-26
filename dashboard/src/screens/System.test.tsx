import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../data/DataProvider'
import { fakeSource } from '../testing/fakeSource'
import { System } from './System'

vi.mock('../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))
vi.mock('./useLauncher', () => ({
  useLauncher: () => ({
    mode: { kind: 'disabled' }, view: { phase: 'loading' }, busy: null, message: null, backup: null,
    start: vi.fn(), stop: vi.fn(), startAll: vi.fn(), stopAll: vi.fn(), loadLogs: vi.fn(),
  }),
}))

const item = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!

describe('System page, database and optional views', () => {
  it('reads os_optional_health and shows both sections; backups unknown without the launcher', async () => {
    const src = fakeSource({
      os_optional_health: [
        { app: 'taskflow', view: 'taskflow_dashboard_area_daily', exists: true, columns_ok: true, access_ok: true, in_use: true },
        { app: 'taskflow', view: 'taskflow_dashboard_days_off', exists: false, columns_ok: false, access_ok: false, in_use: false },
      ],
      os_apps_now: [{ user_id: 'u', app: 'trading', contract_version: 1, status_line: '', needs_attention: 0, attention_label: null, last_activity_at: new Date().toISOString(), updated_at: new Date().toISOString() }],
    })
    render(<MemoryRouter><DataProvider sourceOverride={src}><System /></DataProvider></MemoryRouter>)
    expect(await screen.findByText('taskflow_dashboard_area_daily', { selector: 'strong' })).toBeInTheDocument()
    expect(item('taskflow_dashboard_area_daily')).toHaveTextContent('In use')
    expect(item('taskflow_dashboard_days_off')).toHaveTextContent('Not published yet')
    expect(await screen.findByText(/in Chart Journal/)).toBeInTheDocument()
    expect(item('Last backup')).toHaveTextContent('Backups are checked from your Mac')
    expect(screen.queryByText(/arrive in phase 6/)).toBeNull()
  })
})
