// The sample-data source. Only ever loaded through `loadSampleSource()` behind `import.meta.env.DEV`, so Vite's dead-code
// removal keeps the fixtures out of a production build.
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import { addDays, todayToronto } from '../lib/time'
import type { Settings } from '../lib/contract'
import { isDashboardView, type DashRow, type DataSource } from './source'

export function makeSampleSource(now: Date = new Date()): DataSource {
  const today = todayToronto(now)
  const views = buildSampleViews(today, now)
  const os = buildSampleOsViews(views, today)
  let saved: Partial<Settings> | null = null // in memory only: sample mode never writes to the database
  return {
    kind: 'sample',
    view: async (name) => os[name] as never,
    dashboardView: async (name, opts) => {
      if (!isDashboardView(name)) throw new Error(`Not a dashboard view: ${name}`)
      const rows = ((views as unknown as Record<string, DashRow[]>)[name] ?? []).slice()
      const since = opts?.days ? addDays(today, -(opts.days - 1)) : null
      return since ? rows.filter((r) => typeof r.day !== 'string' || r.day >= since) : rows
    },
    settings: async () => saved,
    saveSettings: async (patch) => { saved = { ...saved, ...patch }; return null },
  }
}
