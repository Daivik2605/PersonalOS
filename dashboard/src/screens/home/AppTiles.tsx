import { Link } from 'react-router-dom'
import { appByDataKey, appUrl } from '../../lib/apps'
import { ago } from '../../lib/health'
import type { AppTile } from '../../lib/home'
import type { AppStatus } from '../../lib/launcher'
import { card, cardTitle, isHosted, linkBtn, muted } from './ui'
import type { LauncherView } from '../useLauncher'

const STATE_TEXT: Record<AppTile['state'], string> = {
  'not-published': 'Not published yet', 'contract-broken': 'Contract problem', 'needs-rerun': 'Valid, not included yet', ok: 'Published',
}
const DOT: Record<AppStatus['state'], string> = { running: 'bg-emerald-500', external: 'bg-emerald-500', starting: 'bg-amber-400', stopped: 'bg-slate-400' }
const RUN_TEXT: Record<AppStatus['state'], string> = { running: 'Running', external: 'Running', starting: 'Starting', stopped: 'Stopped' }

export interface AppTilesProps {
  tiles: AppTile[]
  now: Date
  launcher: LauncherView
  launcherOn: boolean
  busy: string | null
  onStart: (key: string) => void
}

export function AppTiles({ tiles, now, launcher, launcherOn, busy, onStart }: AppTilesProps) {
  const hosted = isHosted()
  return (
    <section aria-label="Apps" className={card}>
      <h2 className={cardTitle}>Apps</h2>
      {tiles.length === 0 && <p className={muted}>All apps are hidden in Settings.</p>}
      <ul className="grid gap-3 sm:grid-cols-2">
        {tiles.map((t) => {
          const app = appByDataKey(t.dataKey)!
          const st = launcher.phase === 'ok' && app.launcherKey ? launcher.apps.find((a) => a.key === app.launcherKey) : undefined
          const published = t.state !== 'not-published'
          return (
            <li key={t.dataKey} className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                {st && <span aria-hidden className={`size-2.5 rounded-full ${DOT[st.state]}`} />}
                <Link to={`/app/${t.dataKey}`} className="font-semibold underline-offset-2 hover:underline">{t.name}</Link>
                {st && <span className="text-xs text-slate-500">{RUN_TEXT[st.state]}</span>}
                {t.stale && <span className="rounded bg-amber-200 px-1.5 py-0.5 text-xs font-medium text-amber-900">Stale</span>}
              </div>
              <p className={`mt-1 ${muted}`}>{published ? (t.statusLine ?? STATE_TEXT[t.state]) : STATE_TEXT[t.state]}</p>
              {published && <p className="text-xs text-slate-500">Last activity {ago(t.lastActivityAt, now)}</p>}
              <div className="mt-2 flex flex-wrap gap-2">
                <a className={linkBtn} href={appUrl(app, '/', hosted)} target="_blank" rel="noreferrer" aria-label={`Open ${t.name}`}>Open</a>
                {launcherOn && st?.state === 'stopped' && (
                  <button className={linkBtn} disabled={busy !== null} onClick={() => onStart(app.launcherKey!)}>Start</button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
