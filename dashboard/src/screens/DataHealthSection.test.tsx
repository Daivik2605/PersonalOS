import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import { APPS } from '../lib/apps'
import type { HealthRow } from '../lib/contract'
import { allAppHealth } from '../lib/health'
import { DataHealthSection } from './DataHealthSection'

const NOW = new Date('2026-10-25T15:00:00Z')
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString()
const view = (app: string, kind: 'daily' | 'now', over: Partial<HealthRow> = {}): HealthRow => ({
  app, view: `${app}_dashboard_${kind}`, exists: true, columns_ok: true, access_ok: true, in_unions: true,
  contract_version: kind === 'now' ? 1 : null, last_updated_at: kind === 'now' ? hoursAgo(1) : null, ...over,
})
const absent = (app: string) => (['daily', 'now'] as const).map((k) => view(app, k, { exists: false, columns_ok: false, access_ok: false, in_unions: false, contract_version: null, last_updated_at: null }))
const item = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!

describe('DataHealthSection', () => {
  it('zero apps published: all four say "Not published yet", with no timestamps or zeros', () => {
    const rows = allAppHealth(APPS.flatMap((a) => absent(a.dataKey)), [], NOW)
    render(<DataHealthSection health={rows} now={NOW} loading={false} error={null} />)
    expect(screen.getAllByText('Not published yet')).toHaveLength(4)
    expect(screen.queryByText(/Last updated/)).toBeNull()
  })

  it('real project, chart-journal only: trading "Contract OK", the rest not published', () => {
    const rows = allAppHealth([view('trading', 'daily'), view('trading', 'now'), ...absent('dsa'), ...absent('taskflow'), ...absent('money')], [], NOW)
    render(<DataHealthSection health={rows} now={NOW} loading={false} error={null} />)
    expect(item('Chart Journal')).toHaveTextContent('Contract OK, v1')
    expect(item('Chart Journal')).toHaveTextContent('Last updated 1 h ago')
    for (const n of ['InteractiveDSA', 'TaskFlow', 'Money']) expect(item(n)).toHaveTextContent('Not published yet')
  })

  it('sample data: all four apps healthy', () => {
    const os = buildSampleOsViews(buildSampleViews('2026-10-25', NOW))
    render(<DataHealthSection health={allAppHealth(os.os_contract_health, os.os_apps_now, NOW)} now={NOW} loading={false} error={null} />)
    expect(screen.getAllByText(/Contract OK, v1/)).toHaveLength(4)
    expect(screen.queryByText('Stale')).toBeNull()
  })

  it('stale warning only for DSA; every app shows last activity as plain text', () => {
    const old = hoursAgo(80)
    const rows = allAppHealth(
      [...['trading', 'dsa'].flatMap((a) => [view(a, 'daily'), view(a, 'now', { last_updated_at: old })]), ...absent('taskflow'), ...absent('money')],
      [{ user_id: 'u', app: 'trading', contract_version: 1, status_line: '', needs_attention: 0, attention_label: null, last_activity_at: old, updated_at: old },
       { user_id: 'u', app: 'dsa', contract_version: 1, status_line: '', needs_attention: 0, attention_label: null, last_activity_at: old, updated_at: old }],
      NOW,
    )
    render(<DataHealthSection health={rows} now={NOW} loading={false} error={null} />)
    expect(within(item('InteractiveDSA')).getByText('Stale')).toBeInTheDocument()
    expect(within(item('Chart Journal')).queryByText('Stale')).toBeNull()
    expect(item('Chart Journal')).toHaveTextContent('Last activity 3 days ago')
  })

  it('valid-but-not-included says to re-run os_core.sql; broken contract lists the reason; unknown app is named', () => {
    const rows = allAppHealth(
      [view('taskflow', 'daily', { in_unions: false }), view('taskflow', 'now', { in_unions: false }),
       view('dsa', 'daily', { columns_ok: false, in_unions: false }), view('dsa', 'now'), ...absent('trading'), ...absent('money'),
       view('demo', 'daily', { in_unions: false }), view('demo', 'now', { in_unions: false })], [], NOW)
    render(<DataHealthSection health={rows} now={NOW} loading={false} error={null} />)
    expect(item('TaskFlow')).toHaveTextContent('Re-run supabase/os_core.sql')
    expect(item('InteractiveDSA')).toHaveTextContent("Daily view doesn't match the contract columns")
    expect(item('demo')).toHaveTextContent('not in Home\'s app list yet')
    expect(item('demo')).toHaveTextContent('Re-run supabase/os_core.sql')
  })

  it('loading, and an error with the os_core.sql hint (also keeping the last result)', () => {
    const { rerender } = render(<DataHealthSection health={null} now={NOW} loading error={null} />)
    expect(screen.getByRole('status')).toHaveTextContent('Loading')
    rerender(<DataHealthSection health={null} now={NOW} loading={false} error="relation os_contract_health does not exist" />)
    expect(screen.getByRole('alert')).toHaveTextContent(/run supabase\/os_core.sql/)
    rerender(<DataHealthSection health={allAppHealth(APPS.flatMap((a) => absent(a.dataKey)), [], NOW)} now={NOW} loading={false} error="network down" />)
    expect(screen.getByRole('alert')).toHaveTextContent('showing the last result')
    expect(screen.getAllByText('Not published yet')).toHaveLength(4)
  })
})
