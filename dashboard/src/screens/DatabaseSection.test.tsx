import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { backupStatus, databaseActivity, optionalHealth } from '../lib/health'
import { DatabaseSection } from './DatabaseSection'
import { OptionalViewsSection } from './OptionalViewsSection'

const NOW = new Date('2026-10-25T15:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString()
const nowRow = (app: string, last: string | null) => ({ user_id: 'u', app, contract_version: 1, status_line: '', needs_attention: 0, attention_label: null, last_activity_at: last, updated_at: daysAgo(0) })
const item = (name: string) => screen.getByText(name, { selector: 'strong' }).closest('li')!
const backupOf = (date: string | null) => backupStatus({ latest: date ? { name: `${date}.sql.gz`, date, bytes: 3072 } : null, count: date ? 4 : 0 }, NOW)

describe('DatabaseSection', () => {
  it('recent activity and a fresh backup: no warnings', () => {
    render(<DatabaseSection activity={databaseActivity([nowRow('trading', daysAgo(1))], NOW)} backup={backupOf('2026-10-23')} now={NOW} />)
    expect(item('Last activity anywhere')).toHaveTextContent('1 day ago in Chart Journal')
    expect(item('Last backup')).toHaveTextContent('2 days ago')
    expect(item('Last backup')).toHaveTextContent('3 kB, 4 kept')
    expect(screen.queryByText('Quiet')).toBeNull()
    expect(screen.queryByText('Old')).toBeNull()
  })

  it('warns after 5 quiet days, with text, and explains the pause', () => {
    render(<DatabaseSection activity={databaseActivity([nowRow('dsa', daysAgo(6))], NOW)} backup={backupOf('2026-10-23')} now={NOW} />)
    expect(item('Last activity anywhere')).toHaveTextContent('Quiet')
    expect(item('Last activity anywhere')).toHaveTextContent(/pause after about a week/)
  })

  it('warns when the newest backup is more than 8 days old, and when there is none', () => {
    const { unmount } = render(<DatabaseSection activity={databaseActivity([], NOW)} backup={backupOf('2026-10-10')} now={NOW} />)
    expect(item('Last backup')).toHaveTextContent('Old')
    expect(item('Last backup')).toHaveTextContent('15 days ago')
    expect(item('Last activity anywhere')).toHaveTextContent('No activity yet')
    expect(screen.queryByText('Quiet')).toBeNull()
    unmount()
    render(<DatabaseSection activity={null} backup={backupOf(null)} now={NOW} />)
    expect(item('Last backup')).toHaveTextContent('No backup yet')
    expect(item('Last backup')).toHaveTextContent('Missing')
  })

  it('launcher offline or hosted: says backups are checked from the Mac, no warning', () => {
    render(<DatabaseSection activity={null} backup={backupStatus(null, NOW)} now={NOW} />)
    expect(item('Last backup')).toHaveTextContent('Backups are checked from your Mac')
    expect(screen.queryByText('Old')).toBeNull()
    expect(screen.queryByText('Missing')).toBeNull()
  })
})

describe('OptionalViewsSection', () => {
  const row = (view: string, over = {}) => ({ app: 'taskflow', view, exists: true, columns_ok: true, access_ok: true, in_use: true, ...over })
  it('shows each state in words', () => {
    const views = optionalHealth([
      row('taskflow_dashboard_area_daily'),
      row('taskflow_dashboard_days_off', { exists: false, columns_ok: false, access_ok: false, in_use: false }),
    ])
    render(<OptionalViewsSection views={views} loading={false} error={null} />)
    expect(item('taskflow_dashboard_area_daily')).toHaveTextContent('In use')
    expect(item('taskflow_dashboard_days_off')).toHaveTextContent('Not published yet')
    expect(item('taskflow_dashboard_days_off')).toHaveTextContent('Optional')
  })
  it('names the problem for a broken view and says to re-run for an unused one', () => {
    render(<OptionalViewsSection views={optionalHealth([
      row('taskflow_dashboard_area_daily', { columns_ok: false, in_use: false }),
      row('taskflow_dashboard_days_off', { in_use: false }),
    ])} loading={false} error={null} />)
    expect(item('taskflow_dashboard_area_daily')).toHaveTextContent("Problem")
    expect(item('taskflow_dashboard_area_daily')).toHaveTextContent("doesn't have the columns Home needs")
    expect(item('taskflow_dashboard_days_off')).toHaveTextContent('Re-run')
  })
  it('an unreadable os_optional_health asks to re-run os_core.sql instead of showing zeros', () => {
    render(<OptionalViewsSection views={null} loading={false} error="relation does not exist" />)
    expect(screen.getByRole('alert')).toHaveTextContent('os_core.sql')
  })
})
