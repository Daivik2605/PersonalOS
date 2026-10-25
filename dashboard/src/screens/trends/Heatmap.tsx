import { useEffect, useRef } from 'react'
import { formatDuration, formatDay } from '../../lib/time'
import { heatGrid, type HeatCell, type HeatLevel } from '../../lib/trends'
import { card, muted } from '../home/ui'

const CLASS: Record<HeatLevel, string> = {
  none: 'border border-dashed border-slate-300 dark:border-slate-700',
  off: 'bg-slate-400/60 bg-[repeating-linear-gradient(45deg,transparent,transparent_2px,rgba(255,255,255,.55)_2px,rgba(255,255,255,.55)_4px)] dark:bg-slate-500/60',
  0: 'bg-slate-200 dark:bg-slate-800',
  1: 'bg-indigo-200 dark:bg-indigo-900',
  2: 'bg-indigo-400 dark:bg-indigo-600',
  3: 'bg-indigo-600 dark:bg-indigo-400',
}
const LEGEND: { level: HeatLevel; text: string }[] = [
  { level: 'none', text: 'Before I started' }, { level: 0, text: 'Nothing' }, { level: 1, text: 'Under half the goal' },
  { level: 2, text: 'Under the goal' }, { level: 3, text: 'Goal reached' }, { level: 'off', text: 'Day off' },
]
const label = (c: HeatCell) => `${formatDay(c.day)}: ${c.level === 'off' ? `day off${c.minutes ? `, ${formatDuration(c.minutes)}` : ''}` : c.level === 'none' ? 'before I started' : formatDuration(c.minutes)}`

export function Heatmap({ cells, weekStartsOn, goalMinutes, title }: { cells: HeatCell[]; weekStartsOn: number; goalMinutes: number; title: string }) {
  const grid = heatGrid(cells, weekStartsOn)
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => { if (scroller.current) scroller.current.scrollLeft = scroller.current.scrollWidth }, [cells.length]) // newest week in view
  return (
    <section aria-label={title} className={card}>
      <h2 className="mb-2 text-base font-semibold">{title}</h2>
      <p className={`mb-3 ${muted}`}>Productive time per day against your goal of {formatDuration(goalMinutes)}. Days off are hatched and left out of streaks and averages.</p>
      <div ref={scroller} className="overflow-x-auto pb-1">
        <div role="grid" aria-label={title} className="flex w-max gap-1">
          {grid.map((col, ci) => (
            <div key={ci} role="row" className="flex flex-col gap-1">
              {col.map((c, ri) => c
                ? <div key={ri} role="gridcell" data-level={String(c.level)} data-day={c.day} aria-label={label(c)} title={label(c)} className={`size-3.5 rounded-sm ${CLASS[c.level]}`} />
                : <div key={ri} role="presentation" className="size-3.5" />)}
            </div>
          ))}
        </div>
      </div>
      <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
        {LEGEND.map((l) => <li key={String(l.level)} className="flex items-center gap-1.5"><span aria-hidden className={`size-3 rounded-sm ${CLASS[l.level]}`} />{l.text}</li>)}
      </ul>
    </section>
  )
}
