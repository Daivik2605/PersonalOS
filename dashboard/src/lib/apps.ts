// The app registry (SPEC §2.4): the one place the UI learns about each app. Folders and start commands live only in
// launcher/apps.json and are never bundled into the UI.

export interface AppLink { label: string; path: string }

export interface AppEntry {
  /** Key in launcher/apps.json; null while the app has no launcher entry (Money, until it exists). */
  launcherKey: string | null
  /** Key in the data contract (`<dataKey>_dashboard_*`, the `app` column). chart-journal is `trading`. */
  dataKey: string
  name: string
  port: number
  /** Local URL; Money is local-only so it never has a hosted URL. */
  url: string
  hostedUrl: string | null
  icon: string
  /** True when the app mirrors a local store to the cloud, so its data can go stale (SPEC §3.5). Only DSA. */
  syncs: boolean
  /** Relative to `url` (or `hostedUrl` when hosted). Apps without stable routes just link to their home. */
  links: AppLink[]
}

const HOME: AppLink[] = [{ label: 'Open', path: '/' }]

export const APPS: readonly AppEntry[] = [
  { launcherKey: 'chart-journal', dataKey: 'trading', name: 'Chart Journal', port: 5173, url: 'http://localhost:5173', hostedUrl: null, icon: 'chart', syncs: false, links: HOME },
  { launcherKey: 'dsa', dataKey: 'dsa', name: 'InteractiveDSA', port: 5174, url: 'http://localhost:5174', hostedUrl: null, icon: 'code', syncs: true, links: HOME },
  {
    launcherKey: 'taskflow', dataKey: 'taskflow', name: 'TaskFlow', port: 5175, url: 'http://localhost:5175', hostedUrl: null, icon: 'check', syncs: false,
    links: [
      { label: 'Timer', path: '/timer' },
      { label: 'Today', path: '/tasks?view=today' },
      { label: 'Insights', path: '/insights' },
      { label: 'Work', path: '/work' },
      { label: 'Capture', path: '/capture' },
      { label: 'Weekly review', path: '/review' },
      { label: 'Goals', path: '/goals' },
    ],
  },
  { launcherKey: null, dataKey: 'money', name: 'Money', port: 5177, url: 'http://localhost:5177', hostedUrl: null, icon: 'wallet', syncs: false, links: HOME },
]

export function appByDataKey(dataKey: string): AppEntry | undefined {
  return APPS.find((a) => a.dataKey === dataKey)
}
export function appByLauncherKey(launcherKey: string): AppEntry | undefined {
  return APPS.find((a) => a.launcherKey === launcherKey)
}

/** TaskFlow's timer deep link: opens the timer with that tag picked (it does not auto-start). */
export function timerLink(tagPath: string): string {
  return `/timer?tag=${encodeURIComponent(tagPath)}`
}

/** Full URL for a path inside an app: the hosted URL when Home itself is hosted, else the local one. */
export function appUrl(app: AppEntry, path = '/', hosted = false): string {
  const base = hosted && app.hostedUrl ? app.hostedUrl : app.url
  return path === '/' ? base : `${base}${path}`
}
