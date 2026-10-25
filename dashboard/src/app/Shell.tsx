import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { applyTheme, getStoredTheme, type Theme } from '../lib/theme'
import { useAuth } from './auth'
import { NAV } from './nav'
import { OfflineBanner } from './OfflineBanner'

const link = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-11 items-center rounded-lg px-3 text-sm font-medium ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-700 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-800'}`
const tab = ({ isActive }: { isActive: boolean }) =>
  `flex min-h-14 flex-1 items-center justify-center text-sm font-medium ${isActive ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-600 dark:text-slate-400'}`

function ProfileMenu() {
  const { session, signOut } = useAuth()
  const [theme, setTheme] = useState<Theme>(getStoredTheme)
  return (
    <details className="relative">
      <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-lg px-3 text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-800">
        Profile
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-56 space-y-3 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
        <p className="truncate text-xs text-slate-500">{session?.user.email}</p>
        <label className="block text-sm font-medium">Theme
          <select
            className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-2 dark:border-slate-700 dark:bg-slate-950"
            value={theme}
            onChange={(e) => { const t = e.target.value as Theme; setTheme(t); applyTheme(t) }}
          >
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <button onClick={() => void signOut()} className="min-h-11 w-full rounded-lg border border-slate-300 text-sm font-medium dark:border-slate-700">Sign out</button>
      </div>
    </details>
  )
}

export function Shell() {
  return (
    <div className="flex min-h-full flex-col lg:flex-row">
      <aside className="hidden w-56 shrink-0 flex-col gap-1 border-r border-slate-200 p-3 lg:flex dark:border-slate-800">
        <p className="px-3 py-2 text-lg font-semibold">PersonalOS</p>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={link}>{n.label}</NavLink>)}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-1 dark:border-slate-800">
          <p className="text-base font-semibold lg:invisible">PersonalOS</p>
          <ProfileMenu />
        </header>
        <OfflineBanner />
        <main className="flex-1 px-4 py-5 pb-24 lg:pb-8"><Outlet /></main>
      </div>
      <nav aria-label="Tabs" className="fixed inset-x-0 bottom-0 z-10 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden dark:border-slate-800 dark:bg-slate-900">
        {NAV.map((n) => <NavLink key={n.to} to={n.to} end={n.end} className={tab}>{n.label}</NavLink>)}
      </nav>
    </div>
  )
}
