// The sample-data source. Only ever loaded through `loadSampleSource()` behind `import.meta.env.DEV`, so Vite's dead-code
// removal keeps the fixtures out of a production build.
import { buildSampleOsViews, buildSampleViews } from '../fixtures'
import { todayToronto } from '../lib/time'
import type { Settings } from '../lib/contract'
import type { DataSource } from './source'

export function makeSampleSource(now: Date = new Date()): DataSource {
  const os = buildSampleOsViews(buildSampleViews(todayToronto(now), now))
  let saved: Partial<Settings> | null = null // in memory only: sample mode never writes to the database
  return {
    kind: 'sample',
    view: async (name) => os[name] as never,
    settings: async () => saved,
    saveSettings: async (patch) => { saved = { ...saved, ...patch }; return null },
  }
}
