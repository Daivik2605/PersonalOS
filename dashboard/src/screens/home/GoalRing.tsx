import { formatDuration } from '../../lib/time'
import type { GoalRing as Ring } from '../../lib/pace'

const STROKE: Record<Ring['state'], string> = {
  'no-data': 'stroke-slate-300 dark:stroke-slate-700', 'day-off': 'stroke-slate-400', reached: 'stroke-emerald-500', 'in-progress': 'stroke-indigo-500',
}

/** Productive minutes today vs the daily goal. State is always in text too, never colour alone. */
export function GoalRing({ ring }: { ring: Ring }) {
  const r = 50, c = 2 * Math.PI * r
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-32 shrink-0">
        <svg viewBox="0 0 120 120" className="size-full -rotate-90" role="img" aria-label={`Productive today: ${ring.minutes === null ? 'no data' : formatDuration(ring.minutes)} of ${formatDuration(ring.goal)}`}>
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-slate-200 dark:stroke-slate-800" />
          <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" strokeLinecap="round" className={STROKE[ring.state]}
            strokeDasharray={c} strokeDashoffset={c * (1 - ring.percent / 100)} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-xl font-semibold">{ring.minutes === null ? 'No data' : formatDuration(ring.minutes)}</span>
          <span className="text-xs text-slate-500">of {formatDuration(ring.goal)}</span>
        </div>
      </div>
      <div>
        <p className="text-lg font-semibold">{ring.label}</p>
        {ring.hint && <p className={`text-sm font-medium ${ring.hint === 'behind' ? 'text-amber-700 dark:text-amber-400' : 'text-emerald-700 dark:text-emerald-400'}`}>{ring.hint === 'behind' ? 'Behind pace' : 'On pace'}</p>}
        <p className="text-xs text-slate-500">Productive = study + hustle, across apps</p>
      </div>
    </div>
  )
}
