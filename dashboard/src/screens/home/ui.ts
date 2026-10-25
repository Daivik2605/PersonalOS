// Shared class names and small helpers for the Home cards.
import { launcherMode } from '../../lib/launcher'

export const card = 'rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900'
export const cardTitle = 'mb-3 text-base font-semibold'
export const muted = 'text-sm text-slate-600 dark:text-slate-400'
export const linkBtn = 'inline-flex min-h-11 items-center rounded-lg border border-slate-300 px-3 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
export const NO_DATA = 'No data'

/** Hosted builds have no launcher URL: open hosted app URLs there (Phase 7); locally, the local ones. */
export const isHosted = () => launcherMode(import.meta.env.VITE_LAUNCHER_URL as string | undefined, window.location.origin).kind === 'disabled'
