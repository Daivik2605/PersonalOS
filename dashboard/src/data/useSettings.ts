import { useCallback, useEffect, useState } from 'react'
import type { Settings } from '../lib/contract'
import { validateSettings, withDefaults } from '../lib/settings'
import { useData } from './DataProvider'

export interface SettingsState {
  settings: Settings | null
  loading: boolean
  loadError: string | null
  saving: boolean
  /** Resolves to an error message, or null once saved. */
  save: (patch: Partial<Settings>) => Promise<string | null>
}

/** Home's own settings. Loaded once per source (not polled, so a refresh never overwrites what you are typing). */
export function useSettings(): SettingsState {
  const { source, report } = useData()
  const [settings, setSettings] = useState<Settings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setSettings(null); setLoadError(null)
    if (!source) { setLoading(true); return }
    let live = true
    setLoading(true)
    source.settings().then(
      (row) => { if (live) { setSettings(withDefaults(row)); setLoading(false); report(true) } },
      (e: unknown) => { if (live) { setLoadError(e instanceof Error ? e.message : String(e)); setLoading(false); report(false) } },
    )
    return () => { live = false }
  }, [source, report])

  const save = useCallback(async (patch: Partial<Settings>) => {
    const invalid = validateSettings(patch)
    if (invalid) return invalid
    if (!source) return 'Not connected yet.'
    setSaving(true)
    try {
      const err = await source.saveSettings(patch)
      if (!err) setSettings((s) => withDefaults({ ...(s ?? {}), ...patch }))
      return err
    } catch (e) {
      return e instanceof Error ? e.message : String(e)
    } finally {
      setSaving(false)
    }
  }, [source])

  return { settings, loading, loadError, saving, save }
}
