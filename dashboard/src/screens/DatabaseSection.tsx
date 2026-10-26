import type { DatabaseActivity, BackupStatus } from '../lib/health'
import { QUIET_DAYS, BACKUP_DAYS, ago, formatBytes } from '../lib/health'
import { APPS } from '../lib/apps'
import { formatDay } from '../lib/time'

const WARN = 'rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900'
const CARD = 'rounded-xl border border-slate-200 p-3 dark:border-slate-800'
const NOTE = 'mt-1 text-sm text-slate-600 dark:text-slate-400'

export interface DatabaseSectionProps {
  activity: DatabaseActivity | null // null while the app rows are loading or failed
  backup: BackupStatus
  now: Date
}

export function DatabaseSection({ activity, backup, now }: DatabaseSectionProps) {
  const appName = (key: string | null) => APPS.find((a) => a.dataKey === key)?.name ?? key
  return (
    <ul className="space-y-2">
      <li className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <strong>Last activity anywhere</strong>
          {activity?.at && <span className="text-sm">{ago(activity.at, now)}{activity.app ? ` in ${appName(activity.app)}` : ''}</span>}
          {activity && !activity.at && <span className="text-sm">No activity yet</span>}
          {activity?.quiet && <span className={WARN}>Quiet</span>}
        </div>
        {activity?.quiet && (
          <p className="mt-1 text-sm">Nothing recorded for more than {QUIET_DAYS} days. Free Supabase projects pause after about a week without activity, so use an app soon or open the Supabase dashboard.</p>
        )}
        {!activity && <p className={NOTE}>Not available yet.</p>}
      </li>
      <li className={CARD}>
        <div className="flex flex-wrap items-center gap-2">
          <strong>Last backup</strong>
          {(backup.kind === 'ok' || backup.kind === 'old') && (
            <span className="text-sm">{formatDay(backup.date)} ({backup.ageDays === 0 ? 'today' : `${backup.ageDays} day${backup.ageDays === 1 ? '' : 's'} ago`}), {formatBytes(backup.bytes)}, {backup.count} kept</span>
          )}
          {backup.kind === 'none' && <span className="text-sm">No backup yet</span>}
          {backup.kind === 'old' && <span className={WARN}>Old</span>}
          {backup.kind === 'none' && <span className={WARN}>Missing</span>}
        </div>
        {backup.kind === 'old' && <p className="mt-1 text-sm">The newest backup is more than {BACKUP_DAYS} days old. The weekly job runs Sunday 03:00; run <code>sh dashboard/launcher/backup.sh</code> to take one now and check <code>dashboard/launcher/logs/backup.log</code>.</p>}
        {backup.kind === 'none' && <p className="mt-1 text-sm">Run <code>sh dashboard/launcher/backup.sh</code> once, then install the weekly job (see the dashboard README).</p>}
        {backup.kind === 'unknown' && <p className={NOTE}>Backups are checked from your Mac. Start the launcher and open PersonalOS at http://localhost:5170 to see them.</p>}
      </li>
    </ul>
  )
}
