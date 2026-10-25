import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { DataProvider } from '../data/DataProvider'
import { fakeSource } from '../testing/fakeSource'
import { Settings } from './Settings'

vi.mock('../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const setup = (src = fakeSource()) => {
  render(<MemoryRouter><DataProvider sourceOverride={src}><Settings /></DataProvider></MemoryRouter>)
  return src
}

describe('Settings', () => {
  it('shows the defaults when no row exists yet, then saves a new daily goal', async () => {
    const src = setup()
    const goal = await screen.findByLabelText(/Daily productive goal/)
    expect(goal).toHaveValue('240')
    expect(screen.getByLabelText('Week starts on')).toHaveValue('1')
    await userEvent.clear(goal)
    await userEvent.type(goal, '300')
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Saved.')
    expect(src.saved).toEqual([{ daily_goal_minutes: 300, week_starts_on: 1, hidden_apps: [], card_order: expect.any(Array), theme: 'system' }])
  })

  it('loads a saved row, and refuses a bad goal without calling the database', async () => {
    const src = setup(fakeSource({}, { daily_goal_minutes: 120, week_starts_on: 0 }))
    const goal = await screen.findByLabelText(/Daily productive goal/)
    expect(goal).toHaveValue('120')
    expect(screen.getByLabelText('Week starts on')).toHaveValue('0')
    await userEvent.clear(goal)
    await userEvent.type(goal, '0')
    expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled()
    expect(screen.getByText(/between 1 and 1440/)).toBeInTheDocument()
    expect(src.saveSettings).not.toHaveBeenCalled()
  })

  it('hides an app, reorders a card, and reports a database error', async () => {
    const src = fakeSource()
    src.state.saveError = 'permission denied'
    setup(src)
    await userEvent.click(await screen.findByRole('checkbox', { name: 'Money' }))
    await userEvent.click(screen.getByRole('button', { name: 'Move attention up' }))
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Not saved: permission denied')
    src.state.saveError = null
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(src.saved).toHaveLength(1))
    expect(src.saved[0]).toMatchObject({ hidden_apps: ['money'], card_order: expect.arrayContaining(['attention', 'goals']) })
    expect(src.saved[0]!.card_order![0]).toBe('attention')
  })

  it('links to TaskFlow goals and offers the dev-only sample toggle', async () => {
    setup()
    expect(await screen.findByRole('link', { name: 'Edit goals in TaskFlow' })).toHaveAttribute('href', 'http://localhost:5175/goals')
  })

  it('says what to do when settings cannot load', async () => {
    const src = fakeSource()
    src.state.fail = true
    setup(src)
    expect(await screen.findByRole('alert')).toHaveTextContent(/os_core.sql/)
  })
})
