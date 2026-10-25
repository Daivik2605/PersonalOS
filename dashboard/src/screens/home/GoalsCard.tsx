import { appByDataKey, appUrl } from '../../lib/apps'
import type { GoalState, GoalView } from '../../lib/goals'
import { card, cardTitle, isHosted, linkBtn, muted } from './ui'

const STATE_TEXT: Record<GoalState, string> = {
  hit: 'reached', 'in-progress': '', missed: 'missed', within: 'within limit', warning: 'near limit', over: 'over limit',
}
const CHIP: Record<GoalState, string> = {
  hit: 'border-emerald-500', 'in-progress': 'border-slate-300 dark:border-slate-700', missed: 'border-red-500',
  within: 'border-emerald-500', warning: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40', over: 'border-red-500 bg-red-50 dark:bg-red-950/40',
}
const tf = appByDataKey('taskflow')!

export function GoalsCard({ daily, longer, published }: { daily: GoalView[]; longer: GoalView[]; published: boolean }) {
  const hosted = isHosted()
  const open = (g: GoalView) => appUrl(tf, g.link, hosted)
  return (
    <section aria-label="Goals today" className={card}>
      <h2 className={cardTitle}>Goals today</h2>
      {!published && <p className={muted}>TaskFlow hasn't published yet, so there are no goals to show.</p>}
      {published && daily.length === 0 && longer.length === 0 && (
        <p className={muted}>No goals yet. <a className="underline" href={appUrl(tf, '/goals', hosted)} target="_blank" rel="noreferrer">Set them in TaskFlow</a>.</p>
      )}
      {daily.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {daily.map((g) => (
            <li key={`${g.id}-${g.periodStart}`}>
              <a href={open(g)} target="_blank" rel="noreferrer" className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3 text-sm ${CHIP[g.state]}`}>
                <strong>{g.name}</strong> <span>{g.progressText}</span>{' '}
                {STATE_TEXT[g.state] && <span className="text-slate-600 dark:text-slate-400">{STATE_TEXT[g.state]}</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
      {longer.length > 0 && (
        <ul className="mt-4 space-y-3">
          {longer.map((g) => (
            <li key={`${g.id}-${g.periodStart}`}>
              <a href={open(g)} target="_blank" rel="noreferrer" className="block">
                <div className="flex justify-between text-sm"><span><strong>{g.name}</strong> <span className="text-slate-500">{g.targetLabel}</span></span><span>{g.progressText}</span></div>
                <div role="progressbar" aria-label={g.name} aria-valuemin={0} aria-valuemax={100} aria-valuenow={g.percent} className="mt-1 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
                  <div className={`h-2 rounded-full ${g.state === 'over' ? 'bg-red-500' : g.state === 'hit' ? 'bg-emerald-500' : 'bg-indigo-500'}`} style={{ width: `${g.percent}%` }} />
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
      {published && <p className="mt-3"><a className={linkBtn} href={appUrl(tf, '/goals', hosted)} target="_blank" rel="noreferrer">All goals in TaskFlow</a></p>}
    </section>
  )
}
