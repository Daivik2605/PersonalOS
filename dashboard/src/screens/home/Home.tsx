import { Link } from 'react-router-dom'
import { useLauncher } from '../useLauncher'
import { normalizeCardOrder } from '../../lib/settings'
import { AppTiles } from './AppTiles'
import { AttentionCard } from './AttentionCard'
import { DeadlinesCard } from './DeadlinesCard'
import { GoalsCard } from './GoalsCard'
import { HeaderCard } from './HeaderCard'
import { MoneyCardView } from './MoneyCardView'
import { QuickLinks } from './QuickLinks'
import { useHomeData } from './useHomeData'
import { muted } from './ui'

export function Home() {
  const { model, health, error, now, hiddenApps, cardOrder } = useHomeData()
  const l = useLauncher()
  if (!model) {
    return (
      <section>
        <h1 className="text-2xl font-semibold">Home</h1>
        {error
          ? <p role="alert" className="mt-3 rounded-lg bg-amber-100 p-3 text-sm text-amber-900 dark:bg-amber-900/40 dark:text-amber-100">Couldn't load Home: {error}. If you haven't yet, run <code>supabase/os_core.sql</code> in the Supabase SQL Editor.</p>
          : <p role="status" className={`mt-3 ${muted}`}>Loading…</p>}
      </section>
    )
  }
  const tfPublished = health?.find((h) => h.dataKey === 'taskflow')?.state === 'ok' || health?.find((h) => h.dataKey === 'taskflow')?.state === 'needs-rerun'
  const cards: Record<string, React.JSX.Element | null> = {
    goals: <GoalsCard key="goals" daily={model.goals.daily} longer={model.goals.longer} published={!!tfPublished} />,
    attention: <AttentionCard key="attention" items={model.attention} anyPublished={model.anyPublished} />,
    deadlines: <DeadlinesCard key="deadlines" items={model.deadlines} published={!!tfPublished} />,
    money: model.money ? <MoneyCardView key="money" money={model.money} /> : null,
    apps: <AppTiles key="apps" tiles={model.tiles} now={now} launcher={l.view} launcherOn={l.mode.kind === 'enabled'} busy={l.busy} onStart={(k) => void l.start(k)} />,
    links: <QuickLinks key="links" hiddenApps={hiddenApps} />,
  }
  return (
    <section>
      <h1 className="sr-only">Home</h1>
      {!model.anyPublished && (
        <p className="mb-4 rounded-lg bg-slate-200 p-3 text-sm dark:bg-slate-800">No apps have published data yet. See <Link className="underline" to="/system">System</Link> for what each app needs.</p>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:col-span-2"><HeaderCard model={model} /></div>
        {normalizeCardOrder(cardOrder).map((id) => (id === 'apps' ? <div key={id} className="lg:col-span-2">{cards[id]}</div> : cards[id]))}
      </div>
    </section>
  )
}
