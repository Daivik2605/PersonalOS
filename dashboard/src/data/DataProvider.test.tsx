import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fakeSource } from '../testing/fakeSource'
import { SampleBanner, UnreachableBanner, UpdatedAt } from '../app/DataBanners'
import { DataProvider, REFRESH_MS, useView } from './DataProvider'
import type { DataSource } from './source'
import type { NowRow } from '../lib/contract'

vi.mock('../app/auth', () => ({ useAuth: () => ({ session: null, loading: false, signIn: vi.fn(), signOut: vi.fn() }) }))

const nowRow = (status: string): NowRow => ({ user_id: 'u', app: 'trading', contract_version: 1, status_line: status, needs_attention: 0, attention_label: null, last_activity_at: null, updated_at: '2026-10-25T12:00:00Z' })
const wrap = (source: DataSource) => ({ children }: { children: ReactNode }) => <DataProvider sourceOverride={source}>{children}</DataProvider>

describe('data layer', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('loads a view, then refetches every 60 seconds', async () => {
    const src = fakeSource({ os_apps_now: [nowRow('first')] })
    const { result } = renderHook(() => useView('os_apps_now'), { wrapper: wrap(src) })
    expect(result.current.loading).toBe(true)
    await waitFor(() => expect(result.current.data?.[0]?.status_line).toBe('first'))
    expect(src.view).toHaveBeenCalledTimes(1)
    src.state.views.os_apps_now = [nowRow('second')]
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS) })
    await waitFor(() => expect(result.current.data?.[0]?.status_line).toBe('second'))
    expect(src.view).toHaveBeenCalledTimes(2)
  })

  it('refetches when the window regains focus (not more than once per 5 s)', async () => {
    const src = fakeSource({ os_apps_now: [nowRow('a')] })
    renderHook(() => useView('os_apps_now'), { wrapper: wrap(src) })
    await waitFor(() => expect(src.view).toHaveBeenCalledTimes(1))
    await act(async () => { window.dispatchEvent(new Event('focus')) })
    expect(src.view).toHaveBeenCalledTimes(1) // too soon after the load
    await act(async () => { await vi.advanceTimersByTimeAsync(6000); window.dispatchEvent(new Event('focus')) })
    await waitFor(() => expect(src.view).toHaveBeenCalledTimes(2))
  })

  it('on failure keeps the last loaded data, shows the unreachable banner, and recovers', async () => {
    const src = fakeSource({ os_apps_now: [nowRow('kept')] })
    function Probe() {
      const v = useView('os_apps_now')
      return <p data-testid="p">{v.data?.[0]?.status_line ?? 'none'}|{v.error ?? 'ok'}</p>
    }
    render(<DataProvider sourceOverride={src}><UnreachableBanner /><UpdatedAt /><Probe /></DataProvider>)
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('kept|ok'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText(/Updated/)).toBeInTheDocument()

    src.state.fail = true
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS) })
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('kept|network down'))
    expect(screen.getByRole('alert')).toHaveTextContent(/Can't reach the database. Showing the data loaded/)

    src.state.fail = false
    await act(async () => { await vi.advanceTimersByTimeAsync(REFRESH_MS) })
    await waitFor(() => expect(screen.getByTestId('p')).toHaveTextContent('kept|ok'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says "Not loaded yet" before the first success', () => {
    const src = fakeSource()
    ;(src.view as ReturnType<typeof vi.fn>).mockImplementation(() => new Promise(() => {}))
    render(<DataProvider sourceOverride={src}><UpdatedAt /></DataProvider>)
    expect(screen.getByText('Not loaded yet')).toBeInTheDocument()
  })

  it('shows the permanent Sample data banner only for a sample source', () => {
    const sample = { ...fakeSource(), kind: 'sample' as const }
    const { unmount } = render(<DataProvider sourceOverride={sample}><SampleBanner /></DataProvider>)
    expect(screen.getByRole('status')).toHaveTextContent('Sample data')
    unmount()
    render(<DataProvider sourceOverride={fakeSource()}><SampleBanner /></DataProvider>)
    expect(screen.queryByText('Sample data')).toBeNull()
  })
})
