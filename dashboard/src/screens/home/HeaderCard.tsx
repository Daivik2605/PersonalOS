import type { HomeModel } from '../../lib/home'
import { formatDuration } from '../../lib/time'
import { GoalRing } from './GoalRing'
import { card, NO_DATA } from './ui'

const TONE = {
  none: 'border-slate-300 dark:border-slate-700', ok: 'border-emerald-500', amber: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40', red: 'border-red-500 bg-red-50 dark:bg-red-950/40',
} as const
const TONE_TEXT = { none: '', ok: '', amber: 'Close to the limit', red: 'Over the limit' } as const

function Stat({ label, value, sub }: { label: string; value: string | null; sub?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-lg font-semibold">{value ?? <span className="text-base font-normal text-slate-500">{NO_DATA}</span>}</dd>
      {sub && <dd className="text-xs text-slate-500">{sub}</dd>}
    </div>
  )
}

export function HeaderCard({ model }: { model: HomeModel }) {
  const h = model.header
  return (
    <section aria-label="Today" className={card}>
      <GoalRing ring={h.ring} />
      <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Streak" value={h.streak ? `${h.streak.current} ${h.streak.current === 1 ? 'day' : 'days'}` : null} sub={h.streak ? `best ${h.streak.longest}. Days off skipped` : undefined} />
        <Stat label="Work today" value={h.workMinutes === null ? null : formatDuration(h.workMinutes)} />
        <Stat label="Last night" value={h.sleepMinutes === null ? null : formatDuration(h.sleepMinutes)} />
        <div>
          <dt className="text-xs text-slate-500">Counters today</dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {h.counters.length === 0 && <span className="text-base text-slate-500">{NO_DATA}</span>}
            {h.counters.map((c) => (
              <span key={c.key} data-tone={c.tone} title={`7-day average ${c.avg7} per day${c.limit !== null ? `, limit ${c.limit}` : ''}`}
                className={`rounded-full border px-3 py-1 text-sm ${TONE[c.tone]}`}>
                <strong>{c.label} {c.today}</strong>
                <span className="text-slate-600 dark:text-slate-400"> avg {c.avg7}{c.limit !== null ? ` / limit ${c.limit}` : ''}</span>
                {TONE_TEXT[c.tone] && <span className="sr-only"> {TONE_TEXT[c.tone]}</span>}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </section>
  )
}
