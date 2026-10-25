import { useState } from 'react'
import { appByDataKey, appUrl } from '../../lib/apps'
import { formatCents, type MoneyCard } from '../../lib/home'
import { card, isHosted, linkBtn, NO_DATA } from './ui'

const money = appByDataKey('money')!

/** Amounts are hidden on the phone until tapped (anyone glancing at the screen can't read them); from 640 px they show. */
function Amount({ cents, signed, revealed }: { cents: number | null; signed?: boolean; revealed: boolean }) {
  if (cents === null) return <span className="text-base font-normal text-slate-500">{NO_DATA}</span>
  return (
    <>
      <span data-amount className={revealed ? '' : 'max-sm:hidden'}>{formatCents(cents, signed)}</span>
      {!revealed && <span data-mask aria-hidden className="sm:hidden">*****</span>}
    </>
  )
}

export function MoneyCardView({ money: m }: { money: MoneyCard }) {
  const [revealed, setRevealed] = useState(false)
  return (
    <section aria-label="Money" className={card}>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Money this month</h2>
        <button className="min-h-11 rounded-lg px-3 text-sm underline sm:hidden" aria-pressed={revealed} onClick={() => setRevealed((r) => !r)}>{revealed ? 'Hide amounts' : 'Show amounts'}</button>
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><dt className="text-xs text-slate-500">In</dt><dd className="text-lg font-semibold"><Amount cents={m.inCents} revealed={revealed} /></dd></div>
        <div><dt className="text-xs text-slate-500">Out</dt><dd className="text-lg font-semibold"><Amount cents={m.outCents} revealed={revealed} /></dd></div>
        <div><dt className="text-xs text-slate-500">Net</dt><dd className="text-lg font-semibold"><Amount cents={m.netCents} signed revealed={revealed} /></dd></div>
        <div><dt className="text-xs text-slate-500">Subscriptions / month</dt><dd className="text-lg font-semibold"><Amount cents={m.subscriptionsCents} revealed={revealed} /></dd></div>
      </dl>
      <p className="mt-3 text-sm">{m.toCategorise === null ? NO_DATA : <><strong>{m.toCategorise}</strong> {m.toCategoriseLabel}</>}</p>
      <p className="mt-3"><a className={linkBtn} href={appUrl(money, '/', isHosted())} target="_blank" rel="noreferrer">Open Money</a></p>
    </section>
  )
}
