import { useEffect, useState } from 'react'

/** Browser offline. (Supabase unreachable is UnreachableBanner in DataBanners.) */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const up = () => setOnline(true)
    const down = () => setOnline(false)
    window.addEventListener('online', up)
    window.addEventListener('offline', down)
    return () => { window.removeEventListener('online', up); window.removeEventListener('offline', down) }
  }, [])
  if (online) return null
  return (
    <div role="alert" className="bg-amber-100 px-4 py-2 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">
      You're offline. Showing what's already loaded; numbers may be out of date.
    </div>
  )
}
