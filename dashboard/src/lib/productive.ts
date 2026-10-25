// Productive time across apps (SPEC §2.2). The SQL in supabase/os_core.sql part 2 is what runs against the real data;
// this is the same rule in TypeScript so sample-data mode shows the numbers the database would, and src/lib/productive.test.ts
// runs the same cases as supabase/tests/scenarios_p3.sql. Rows are one user's (the database applies row-level security).
import type { DailyRow, ProductiveDailyRow, StreakRow, TagDailyRow, TaskflowAreaDailyRow, TaskflowDaysOffRow } from './contract'
import { addDays, diffDays, type Day } from './time'

/** Mirrors `os_app_kind`: the kind of time an app's own minutes count as, and the name of its fallback tag Study/<label>. */
export const APP_KINDS: Readonly<Record<string, { kind: string; label: string }>> = {
  trading: { kind: 'study', label: 'Trading' },
  dsa: { kind: 'study', label: 'DSA' },
}

/** Kinds of time that count as productive. */
export const PRODUCTIVE_KINDS: readonly string[] = ['study', 'hustle']


/**
 * The max-rule. Per day and app: minutes = max(TaskFlow minutes on the tag that carries the app's `app_key`, the app's own
 * `active_minutes`). The surplus is added to the linked tag (source 'max'). App minutes with no row to join are their own row
 * (source 'app'): under the linked tag if TaskFlow has one, else parent 'Study', tag <label>, path 'Study/<label>'.
 * The linked tag is the one carrying the app_key on the most recent day (app_key is unique among non-archived tags).
 * TaskFlow's own `_daily` row is never an input, so nothing counts twice.
 */
export function tagDaily(area: TaskflowAreaDailyRow[], appDaily: DailyRow[], userId = ''): TagDailyRow[] {
  const tf = new Map<string, TaskflowAreaDailyRow>() // day|tag_path -> row (rows summed like the SQL group by)
  for (const r of area) {
    const k = `${r.day}|${r.parent_tag}|${r.tag}|${r.tag_path}|${r.kind}|${r.app_key}`
    const e = tf.get(k)
    tf.set(k, e ? { ...e, minutes: e.minutes + r.minutes } : { ...r })
  }
  const rows = [...tf.values()]

  const linked = new Map<string, TaskflowAreaDailyRow>() // app_key -> tag, most recent day wins, then tag_path
  for (const r of rows) {
    if (r.app_key === null) continue
    const cur = linked.get(r.app_key)
    if (!cur || r.day > cur.day || (r.day === cur.day && r.tag_path < cur.tag_path)) linked.set(r.app_key, r)
  }
  const tfByApp = new Map<string, number>() // day|app_key -> minutes
  for (const r of rows) if (r.app_key !== null) tfByApp.set(`${r.day}|${r.app_key}`, (tfByApp.get(`${r.day}|${r.app_key}`) ?? 0) + r.minutes)

  const appMinutes = new Map<string, number>() // day|app -> minutes (only apps that have a kind)
  for (const r of appDaily) {
    if (!APP_KINDS[r.app] || !(r.active_minutes > 0)) continue
    appMinutes.set(`${r.day}|${r.app}`, (appMinutes.get(`${r.day}|${r.app}`) ?? 0) + r.active_minutes)
  }
  const gap = new Map<string, number>() // day|app -> surplus the app measured beyond TaskFlow
  for (const [k, m] of appMinutes) {
    const extra = m - (tfByApp.get(k) ?? 0)
    if (extra > 0) gap.set(k, extra)
  }

  const out: TagDailyRow[] = rows.map((t) => {
    const l = t.app_key !== null ? linked.get(t.app_key) : undefined
    const extra = l && l.tag_path === t.tag_path ? gap.get(`${t.day}|${t.app_key}`) : undefined
    return { user_id: userId, day: t.day, parent_tag: t.parent_tag, tag: t.tag, kind: t.kind, app_key: t.app_key,
      minutes: t.minutes + (extra ?? 0), source: extra !== undefined ? 'max' : 'taskflow', tag_path: t.tag_path }
  })
  for (const [k, extra] of gap) {
    const [day, app] = k.split('|') as [Day, string]
    const l = linked.get(app)
    if (l && rows.some((t) => t.day === day && t.tag_path === l.tag_path)) continue // absorbed above
    const meta = APP_KINDS[app]!
    out.push({ user_id: userId, day, parent_tag: l?.parent_tag ?? 'Study', tag: l?.tag ?? meta.label, kind: l?.kind ?? meta.kind, app_key: app,
      minutes: extra, source: 'app', tag_path: l?.tag_path ?? `Study/${meta.label}` })
  }
  return out.sort((a, b) => a.day.localeCompare(b.day) || a.tag_path.localeCompare(b.tag_path))
}

/** Study + hustle minutes per day, plus days off. A row exists for every day with minutes or marked as a day off. */
export function productiveDaily(tags: TagDailyRow[], daysOff: Pick<TaskflowDaysOffRow, 'day'>[] = [], userId = ''): ProductiveDailyRow[] {
  const minutes = new Map<Day, number>()
  for (const t of tags) if (PRODUCTIVE_KINDS.includes(t.kind)) minutes.set(t.day, (minutes.get(t.day) ?? 0) + t.minutes)
  const off = new Set(daysOff.map((d) => d.day))
  const days = [...new Set([...minutes.keys(), ...off])].sort()
  return days.map((day) => ({ user_id: userId, day, minutes: minutes.get(day) ?? 0, is_day_off: off.has(day) }))
}

/**
 * Productive streak as of `today` (a Toronto day). A productive day has minutes > 0. Days off are left out of the sequence, so
 * they neither break nor extend a streak (even with minutes on them). Today at 0 is left out too: it can't break the streak
 * until it is over; yesterday at 0 does. Returns null when there has never been a productive day (the SQL returns no row).
 */
export function streak(days: ProductiveDailyRow[], today: Day, userId = ''): StreakRow | null {
  const byDay = new Map(days.map((d) => [d.day, d]))
  const first = days.filter((d) => d.minutes > 0).map((d) => d.day).sort()[0]
  if (!first || first > today) return null
  const counted: { day: Day; prod: boolean }[] = []
  for (let n = 0, span = diffDays(first, today); n <= span; n++) {
    const day = addDays(first, n)
    const row = byDay.get(day)
    const minutes = row?.minutes ?? 0
    if (row?.is_day_off) continue
    if (day === today && minutes === 0) continue
    counted.push({ day, prod: minutes > 0 })
  }
  if (counted.length === 0) return null
  let longest = 0, run = 0, lastProd: Day | null = null
  for (const c of counted) {
    run = c.prod ? run + 1 : 0
    if (c.prod) lastProd = c.day
    longest = Math.max(longest, run)
  }
  if (lastProd === null) return null
  return { user_id: userId, current: run, longest, last_productive_day: lastProd }
}

/** Productive minutes on `day` (0 when there is no row — the day had none). */
export function productiveOn(days: ProductiveDailyRow[], day: Day): number {
  return days.find((d) => d.day === day)?.minutes ?? 0
}

/** Total minutes by kind, for a quick check of where time went (all kinds, not only productive). */
export function minutesByKind(tags: TagDailyRow[]): Record<string, number> {
  const out: Record<string, number> = {}
  for (const t of tags) out[t.kind] = (out[t.kind] ?? 0) + t.minutes
  return out
}

