import { useMemo } from 'react'
import { useNow } from '../app/useNow'
import { useView } from '../data/DataProvider'
import { allAppHealth, type AppHealth } from '../lib/health'
import { readableApps } from '../lib/home'

/** Which apps have published valid views (from Data health). Screens read an app's views only when it is in `readable`. */
export function usePublished(): { health: AppHealth[] | null; readable: Set<string>; now: Date; error: string | null } {
  const now = useNow()
  const h = useView('os_contract_health')
  const n = useView('os_apps_now')
  const health = useMemo(() => (h.data ? allAppHealth(h.data, n.data ?? [], now) : null), [h.data, n.data, now])
  const readable = useMemo(() => readableApps(health ?? []), [health])
  return { health, readable, now, error: h.error ?? n.error }
}
