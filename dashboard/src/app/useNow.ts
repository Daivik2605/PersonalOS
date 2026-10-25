import { useEffect, useState } from 'react'

/** A Date that re-renders its component every `ms`, so "updated 3 min ago" stays true. */
export function useNow(ms = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
