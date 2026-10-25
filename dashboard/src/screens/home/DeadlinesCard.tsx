import { appByDataKey, appUrl } from '../../lib/apps'
import type { DeadlineItem } from '../../lib/home'
import { formatDay } from '../../lib/time'
import { card, cardTitle, isHosted, muted } from './ui'

const TONE = { none: '', amber: 'border-amber-500 bg-amber-50 dark:bg-amber-950/40', red: 'border-red-500 bg-red-50 dark:bg-red-950/40' } as const
const SHOWN = 6
const tf = appByDataKey('taskflow')!

export function DeadlinesCard({ items, published }: { items: DeadlineItem[]; published: boolean }) {
  const hosted = isHosted()
  return (
    <section aria-label="Coming up" className={card}>
      <h2 className={cardTitle}>Coming up</h2>
      {items.length === 0 ? (
        <p className={muted}>{published ? 'No hard deadlines in the next 60 days.' : 'TaskFlow hasn\'t published yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {items.slice(0, SHOWN).map((d) => (
            <li key={d.id} data-tone={d.tone} className={`flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${d.tone === 'none' ? 'border-slate-200 dark:border-slate-800' : TONE[d.tone]}`}>
              <span><strong>{d.title}</strong> <span className="text-xs text-slate-500">{formatDay(d.dueOn)}</span></span>
              <span className="text-sm font-medium">{d.tone !== 'none' && <span className="sr-only">{d.tone === 'red' ? 'Urgent: ' : 'Soon: '}</span>}{d.text}</span>
            </li>
          ))}
        </ul>
      )}
      {items.length > SHOWN && <p className="mt-2 text-sm"><a className="underline" href={appUrl(tf, '/', hosted)} target="_blank" rel="noreferrer">{items.length - SHOWN} more in TaskFlow</a></p>}
    </section>
  )
}
