import { appByDataKey, appUrl } from '../../lib/apps'
import type { AttentionItem } from '../../lib/home'
import { card, cardTitle, isHosted, muted } from './ui'

export function AttentionCard({ items, anyPublished }: { items: AttentionItem[]; anyPublished: boolean }) {
  const hosted = isHosted()
  return (
    <section aria-label="Needs attention" className={card}>
      <h2 className={cardTitle}>Needs attention</h2>
      {items.length === 0 ? (
        <p className={muted}>{anyPublished ? 'Nothing is waiting.' : 'No apps have published data yet.'}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((i) => {
            const app = appByDataKey(i.appKey)
            return (
              <li key={i.id}>
                <a href={app ? appUrl(app, i.path, hosted) : '#'} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 hover:bg-slate-100 dark:border-slate-800 dark:hover:bg-slate-800">
                  <span>{i.count !== null && <><strong>{i.count}</strong>{' '}</>}{i.label}</span>
                  <span className="text-xs text-slate-500">{app?.name}</span>
                </a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
