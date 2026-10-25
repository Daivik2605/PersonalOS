import { useEffect, useState } from 'react'
import { useAuth } from '../app/auth'
import { useData } from '../data/DataProvider'
import { useSettings } from '../data/useSettings'
import { APPS, appByDataKey, appUrl } from '../lib/apps'
import type { Settings as SettingsRow } from '../lib/contract'
import { formatDuration } from '../lib/time'
import { applyTheme } from '../lib/theme'
import { HOME_CARDS, WEEKDAYS, moveCard, normalizeCardOrder, validateSettings } from '../lib/settings'

const field = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 dark:border-slate-700 dark:bg-slate-950'
const btn = 'min-h-11 rounded-lg border border-slate-300 px-3 text-sm font-medium disabled:opacity-40 dark:border-slate-700'

export function Settings() {
  const { settings, loading, loadError, saving, save } = useSettings()
  const { setSample, sample } = useData()
  const { signOut } = useAuth()
  const [draft, setDraft] = useState<SettingsRow | null>(null)
  const [goalText, setGoalText] = useState('')
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (settings && !draft) { setDraft({ ...settings, card_order: normalizeCardOrder(settings.card_order) }); setGoalText(String(settings.daily_goal_minutes)) }
  }, [settings, draft])

  if (loadError) return <p role="alert" className="text-sm">Couldn't load settings: {loadError}. Run <code>supabase/os_core.sql</code> in the SQL Editor if you haven't yet.</p>
  if (loading || !draft) return <p role="status" className="text-sm">Loading…</p>

  const goal = Number(goalText)
  const goalError = validateSettings({ daily_goal_minutes: goal })
  const set = (patch: Partial<SettingsRow>) => { setDraft({ ...draft, ...patch }); setMessage(null) }
  const taskflow = appByDataKey('taskflow')!

  const onSave = async () => {
    if (goalError) { setMessage({ ok: false, text: goalError }); return }
    const next = { ...draft, daily_goal_minutes: goal }
    const err = await save({
      daily_goal_minutes: next.daily_goal_minutes, week_starts_on: next.week_starts_on, hidden_apps: next.hidden_apps,
      card_order: next.card_order, theme: next.theme,
    })
    if (!err) applyTheme(next.theme)
    setMessage(err ? { ok: false, text: `Not saved: ${err}` } : { ok: true, text: 'Saved.' })
  }

  return (
    <section className="max-w-xl">
      <h1 className="text-2xl font-semibold">Settings</h1>
      <div className="mt-5 space-y-6">
        <label className="block text-sm font-medium">Daily productive goal (minutes)
          <input className={field} inputMode="numeric" value={goalText} onChange={(e) => { setGoalText(e.target.value); setMessage(null) }} aria-invalid={goalError !== null} />
          <span className="mt-1 block text-xs font-normal text-slate-600 dark:text-slate-400">
            {goalError ?? `${formatDuration(goal)} a day of study and hustle time. Per-tag goals live in TaskFlow.`}
          </span>
        </label>

        <label className="block text-sm font-medium">Week starts on
          <select className={field} value={draft.week_starts_on} onChange={(e) => set({ week_starts_on: Number(e.target.value) })}>
            {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
          </select>
        </label>

        <label className="block text-sm font-medium">Theme
          <select className={field} value={draft.theme} onChange={(e) => set({ theme: e.target.value as SettingsRow['theme'] })}>
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        <fieldset>
          <legend className="text-sm font-medium">Apps shown on Home</legend>
          <div className="mt-1 space-y-1">
            {APPS.map((a) => (
              <label key={a.dataKey} className="flex min-h-11 items-center gap-3 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={!draft.hidden_apps.includes(a.dataKey)}
                  onChange={(e) => set({ hidden_apps: e.target.checked ? draft.hidden_apps.filter((k) => k !== a.dataKey) : [...draft.hidden_apps, a.dataKey] })} />
                {a.name}
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-medium">Card order on Home</legend>
          <ol className="mt-1 space-y-1">
            {draft.card_order.map((id, i) => (
              <li key={id} className="flex items-center gap-2">
                <span className="flex-1 text-sm">{HOME_CARDS.find((c) => c.id === id)?.label ?? id}</span>
                <button className={btn} disabled={i === 0} onClick={() => set({ card_order: moveCard(draft.card_order, id, -1) })} aria-label={`Move ${id} up`}>Up</button>
                <button className={btn} disabled={i === draft.card_order.length - 1} onClick={() => set({ card_order: moveCard(draft.card_order, id, 1) })} aria-label={`Move ${id} down`}>Down</button>
              </li>
            ))}
          </ol>
        </fieldset>

        {setSample && (
          <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
            <input type="checkbox" className="h-5 w-5" checked={sample} onChange={(e) => setSample(e.target.checked)} />
            Sample data (development only)
          </label>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <button className="min-h-11 rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white disabled:opacity-40" onClick={() => void onSave()} disabled={saving || goalError !== null}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {message && <p role={message.ok ? 'status' : 'alert'} className={`text-sm ${message.ok ? '' : 'text-red-700 dark:text-red-300'}`}>{message.text}</p>}
        </div>

        <div className="space-y-2 border-t border-slate-200 pt-4 dark:border-slate-800">
          <a className="block text-sm underline" href={appUrl(taskflow, '/goals')} target="_blank" rel="noreferrer">Edit goals in TaskFlow</a>
          <button className={btn} onClick={() => void signOut()}>Sign out</button>
        </div>
      </div>
    </section>
  )
}
