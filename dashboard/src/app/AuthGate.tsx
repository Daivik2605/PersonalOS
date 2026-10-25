import { useState, type FormEvent, type ReactNode } from 'react'
import { supabaseConfigured } from '../lib/supabase'
import { useAuth } from './auth'

const card = 'mx-auto mt-[12vh] w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900'
const input = 'min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-base dark:border-slate-700 dark:bg-slate-950'
const primary = 'min-h-12 w-full rounded-lg bg-indigo-600 px-4 text-base font-semibold text-white disabled:opacity-50'

function Centered({ children }: { children: ReactNode }) {
  return <div className="min-h-full px-4"><div className={card}>{children}</div></div>
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading, signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!supabaseConfigured) {
    return (
      <Centered>
        <h1 className="mb-2 text-xl font-semibold">Supabase isn't set up</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Copy <code>.env.example</code> to <code>.env.local</code>, fill in your project URL and anon key, then restart <code>npm run dev</code>.
        </p>
      </Centered>
    )
  }
  if (loading) return <Centered><p role="status">Loading…</p></Centered>
  if (session) return <>{children}</>

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true); setError(null)
    setError(await signIn(email.trim(), password))
    setBusy(false)
  }
  return (
    <Centered>
      <h1 className="mb-1 text-2xl font-semibold">PersonalOS</h1>
      <p className="mb-5 text-sm text-slate-600 dark:text-slate-400">Sign in with your PersonalOS account.</p>
      <form onSubmit={submit} className="space-y-3">
        <label className="block text-sm font-medium">Email
          <input className={`${input} mt-1`} type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="block text-sm font-medium">Password
          <input className={`${input} mt-1`} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        <button className={primary} disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </Centered>
  )
}
