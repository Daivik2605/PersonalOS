import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import type { AppStatus } from '../lib/launcher'
import { AppsSection, type AppsSectionProps } from './AppsSection'

const app = (over: Partial<AppStatus>): AppStatus => ({
  key: 'taskflow', name: 'TaskFlow', port: 5175, url: 'http://localhost:5175', hostedUrl: null,
  up: false, startedByLauncher: false, state: 'stopped', canStop: false, startedAt: null, error: null, ...over,
})

function props(over: Partial<AppsSectionProps> = {}): AppsSectionProps {
  return {
    mode: { kind: 'enabled', url: 'http://127.0.0.1:5171' }, view: { phase: 'ok', apps: [app({})] }, busy: null, message: null,
    onStart: vi.fn(), onStop: vi.fn(), onStartAll: vi.fn(), onStopAll: vi.fn(), loadLogs: vi.fn(async () => ['hello']), ...over,
  }
}

describe('AppsSection', () => {
  it('hides every launcher feature when the launcher is not configured (hosted)', () => {
    render(<AppsSection {...props({ mode: { kind: 'disabled' } })} />)
    expect(screen.queryByRole('button', { name: /start|stop|logs/i })).toBeNull()
  })

  it('tells the user to open localhost:5170 on any other origin, not a generic offline message', () => {
    render(<AppsSection {...props({ mode: { kind: 'wrong-origin', origin: 'http://127.0.0.1:5170' } })} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Open PersonalOS at http://localhost:5170 to use the launcher')
    expect(screen.queryByText(/offline/i)).toBeNull()
  })

  it('says launcher offline when it cannot be reached, and offers no buttons', () => {
    render(<AppsSection {...props({ view: { phase: 'offline' } })} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/launcher offline/i)
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('disables Stop for an app started elsewhere, and enables it for one the launcher started', async () => {
    const onStop = vi.fn()
    const apps = [
      app({ key: 'a', name: 'Alpha', up: true, state: 'external' }),
      app({ key: 'b', name: 'Beta', up: true, state: 'running', startedByLauncher: true, canStop: true }),
    ]
    render(<AppsSection {...props({ view: { phase: 'ok', apps }, onStop })} />)
    const items = screen.getAllByRole('listitem')
    const stop = (i: number) => items[i].querySelector('button:nth-of-type(2)') as HTMLButtonElement
    expect(items[0]).toHaveTextContent('Already running (started elsewhere)')
    expect(stop(0)).toBeDisabled()
    expect(stop(1)).toBeEnabled()
    await userEvent.click(stop(1))
    expect(onStop).toHaveBeenCalledWith('b')
  })

  it('starts a stopped app and shows its logs', async () => {
    const p = props()
    render(<AppsSection {...p} />)
    await userEvent.click(screen.getByRole('button', { name: 'Start' }))
    expect(p.onStart).toHaveBeenCalledWith('taskflow')
    await userEvent.click(screen.getByRole('button', { name: 'Logs' }))
    expect(await screen.findByLabelText('TaskFlow logs')).toHaveTextContent('hello')
  })

  it('disables all buttons while an action is running', () => {
    render(<AppsSection {...props({ busy: 'taskflow' })} />)
    expect(screen.getByRole('button', { name: 'Start' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Start all' })).toBeDisabled()
  })
})
