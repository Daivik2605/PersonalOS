import type { DataSource } from './source'

/** Resolves to the sample source in dev, and to null in a production build (the import below is then unreachable). */
export async function loadSampleSource(): Promise<DataSource | null> {
  if (!import.meta.env.DEV) return null
  const m = await import('./sample')
  return m.makeSampleSource()
}
