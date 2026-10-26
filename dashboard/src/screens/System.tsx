import { useMemo } from 'react'
import { useNow } from '../app/useNow'
import { useView } from '../data/DataProvider'
import { allAppHealth, backupStatus, databaseActivity, optionalHealth } from '../lib/health'
import { AppsSection } from './AppsSection'
import { DataHealthSection } from './DataHealthSection'
import { DatabaseSection } from './DatabaseSection'
import { OptionalViewsSection } from './OptionalViewsSection'
import { useLauncher } from './useLauncher'

export function System() {
  const l = useLauncher()
  const health = useView('os_contract_health')
  const nowRows = useView('os_apps_now')
  const optional = useView('os_optional_health')
  const now = useNow()
  const rows = useMemo(
    () => (health.data ? allAppHealth(health.data, nowRows.data ?? [], now) : null),
    [health.data, nowRows.data, now],
  )
  const optionalRows = useMemo(() => (optional.data ? optionalHealth(optional.data) : null), [optional.data])
  const activity = useMemo(() => (nowRows.data ? databaseActivity(nowRows.data, now) : null), [nowRows.data, now])
  const backup = useMemo(() => backupStatus(l.backup, now), [l.backup, now])
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
      <h2 className="mb-3 mt-8 text-lg font-semibold">Data health</h2>
      <DataHealthSection health={rows} now={now} loading={health.loading} error={health.error ?? nowRows.error} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Optional views</h2>
      <OptionalViewsSection views={optionalRows} loading={optional.loading} error={optional.error} />
      <h2 className="mb-3 mt-8 text-lg font-semibold">Database</h2>
      <DatabaseSection activity={activity} backup={backup} now={now} />
    </section>
  )
}
