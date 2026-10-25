import { useState } from 'react'
import { STATE_LABEL, type AppStatus, type LauncherMode } from '../lib/launcher'
import type { LauncherView } from './useLauncher'

const btn = 'min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-40 dark:border-slate-700'
const DOT: Record<AppStatus['state'], string> = {
  running: 'bg-emerald-500', external: 'bg-emerald-500', starting: 'bg-amber-400', stopped: 'bg-slate-400',
}

export interface AppsSectionProps {
  mode: LauncherMode
  view: LauncherView
  busy: string | null
  message: string | null
  onStart: (key: string) => void
  onStop: (key: string) => void
  onStartAll: () => void
  onStopAll: () => void
  loadLogs: (key: string) => Promise<string[] | null>
}

function Logs({ app, loadLogs }: { app: AppStatus; loadLogs: AppsSectionProps['loadLogs'] }) {
  const [lines, setLines] = useState<string[] | null | undefined>(undefined)
  const [open, setOpen] = useState(false)
  const toggle = async () => {
    if (open) return setOpen(false)
    setOpen(true); setLines(undefined); setLines(await loadLogs(app.key))
  }
  return (
    <div className="mt-2">
      <button className={btn} onClick={() => void toggle()} aria-expanded={open}>{open ? 'Hide logs' : 'Logs'}</button>
      {open && (
        <pre aria-label={`${app.name} logs`} className="mt-2 max-h-72 overflow-auto rounded-lg bg-slate-900 p-3 text-xs text-slate-100">
          {lines === undefined ? 'Loading…' : lines === null ? 'Could not load logs.' : lines.length ? lines.join('\n') : 'No log output yet (the launcher keeps logs only for apps it started).'}
        </pre>
      )}
    </div>
  )
}

export function AppsSection(p: AppsSectionProps) {
  if (p.mode.kind === 'disabled') {
    return <p className="text-sm text-slate-600 dark:text-slate-400">The launcher isn't available here, so starting and stopping apps is hidden. It only runs on the Mac.</p>
  }
  if (p.mode.kind === 'wrong-origin') {
    return <p role="alert" className="rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Open PersonalOS at http://localhost:5170 to use the launcher.</p>
  }
  if (p.view.phase === 'loading') return <p role="status" className="text-sm">Loading…</p>
  if (p.view.phase === 'offline') {
    return (
      <p role="alert" className="rounded-lg bg-slate-200 p-3 text-sm dark:bg-slate-800">
        Launcher offline. Start it with <code>sh start-os.sh</code> (or <code>npm run launcher</code> in <code>dashboard/</code>). Nothing else is affected.
      </p>
    )
  }
  const { apps } = p.view
  const disabled = p.busy !== null
  const anyOwned = apps.some((a) => a.startedByLauncher)
  const anyStartable = apps.some((a) => a.state === 'stopped')
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <button className={btn} disabled={disabled || !anyStartable} onClick={p.onStartAll}>Start all</button>
        <button className={btn} disabled={disabled || !anyOwned} onClick={p.onStopAll}>Stop all</button>
        <span className="self-center text-xs text-slate-500">Stop only affects apps the launcher started.</span>
      </div>
      {p.message && <p role="status" className="mb-3 text-sm text-slate-700 dark:text-slate-300">{p.message}</p>}
      <ul className="space-y-3">
        {apps.map((a) => (
          <li key={a.key} className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center gap-2">
              <span aria-hidden className={`size-3 rounded-full ${DOT[a.state]}`} />
              <h3 className="font-semibold">{a.name}</h3>
              <span className="text-xs text-slate-500">port {a.port}</span>
            </div>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{STATE_LABEL[a.state]}</p>
            {a.error && <p role="alert" className="mt-1 text-sm text-red-600 dark:text-red-400">{a.error}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <button className={btn} disabled={disabled || a.state !== 'stopped'} onClick={() => p.onStart(a.key)}>Start</button>
              <button
                className={btn}
                disabled={disabled || !a.canStop}
                title={a.state === 'external' ? 'Running from another session. The launcher only stops apps it started.' : undefined}
                onClick={() => p.onStop(a.key)}
              >Stop</button>
              {a.up
                ? <a className={`${btn} inline-flex items-center`} href={a.url} target="_blank" rel="noreferrer">Open</a>
                : <span className={`${btn} inline-flex items-center opacity-40`} aria-disabled="true">Open</span>}
            </div>
            {a.state === 'external' && <p className="mt-2 text-xs text-slate-500">Stop is off: the launcher didn't start this one. Stop it in the session that did.</p>}
            <Logs app={a} loadLogs={p.loadLogs} />
          </li>
        ))}
      </ul>
    </div>
  )
}
