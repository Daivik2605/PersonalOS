import { appByDataKey, appUrl } from '../../lib/apps'
import { card, cardTitle, isHosted, linkBtn } from './ui'

const LINKS = [
  { label: 'Start timer', app: 'taskflow', path: '/timer' },
  { label: 'Capture', app: 'taskflow', path: '/capture' },
  { label: 'Today in TaskFlow', app: 'taskflow', path: '/tasks?view=today' },
  { label: 'Open DSA', app: 'dsa', path: '/' },
  { label: 'Open Chart Journal', app: 'trading', path: '/' },
  { label: 'Open Money', app: 'money', path: '/' },
] as const

export function QuickLinks({ hiddenApps }: { hiddenApps: string[] }) {
  const hosted = isHosted()
  return (
    <section aria-label="Quick links" className={card}>
      <h2 className={cardTitle}>Quick links</h2>
      <ul className="flex flex-wrap gap-2">
        {LINKS.filter((l) => !hiddenApps.includes(l.app)).map((l) => (
          <li key={l.label}><a className={linkBtn} href={appUrl(appByDataKey(l.app)!, l.path, hosted)} target="_blank" rel="noreferrer">{l.label}</a></li>
        ))}
      </ul>
    </section>
  )
}
