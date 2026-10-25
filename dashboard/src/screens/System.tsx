import { AppsSection } from './AppsSection'
import { useLauncher } from './useLauncher'

export function System() {
  const l = useLauncher()
  return (
    <section>
      <h1 className="text-2xl font-semibold">System</h1>
      <h2 className="mb-3 mt-5 text-lg font-semibold">Apps</h2>
      <AppsSection
        mode={l.mode} view={l.view} busy={l.busy} message={l.message}
        onStart={(k) => void l.start(k)} onStop={(k) => void l.stop(k)}
        onStartAll={() => void l.startAll()} onStopAll={() => void l.stopAll()}
        loadLogs={l.loadLogs}
      />
      <p className="mt-6 text-sm text-slate-500">Contract health, data freshness and backups arrive in phases 2 and 7.</p>
    </section>
  )
}
