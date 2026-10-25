import { useMemo } from 'react'
import { useNow } from '../../app/useNow'
import { useDashboardView, useView } from '../../data/DataProvider'
import { useSettings } from '../../data/useSettings'
import type { TaskflowDeadlineRow, TaskflowGoalRow } from '../../lib/contract'
import { allAppHealth, type AppHealth } from '../../lib/health'
import { buildHome, readableApps, type HomeModel, type Row } from '../../lib/home'

export interface HomeData {
  model: HomeModel | null
  health: AppHealth[] | null
  error: string | null
  now: Date
  hiddenApps: string[]
  cardOrder: string[]
}

/** Loads everything Home shows. App views are only read for apps Data health says are published. */
export function useHomeData(): HomeData {
  const now = useNow()
  const { settings } = useSettings()
  const healthRows = useView('os_contract_health')
  const nowRows = useView('os_apps_now')
  const productive = useView('os_productive_daily')
  const streak = useView('os_streak')

  const health = useMemo(() => (healthRows.data ? allAppHealth(healthRows.data, nowRows.data ?? [], now) : null), [healthRows.data, nowRows.data, now])
  const readable = useMemo(() => readableApps(health ?? []), [health])
  const tf = readable.has('taskflow')
  const tfDaily = useDashboardView('taskflow_dashboard_daily', tf, 8)
  const tfNow = useDashboardView('taskflow_dashboard_now', tf)
  const goals = useDashboardView('taskflow_dashboard_goals', tf)
  const deadlines = useDashboardView('taskflow_dashboard_deadlines', tf)
  const daysOff = useDashboardView('taskflow_dashboard_days_off', tf)
  const moneyNow = useDashboardView('money_dashboard_now', readable.has('money'))

  const hiddenApps = settings?.hidden_apps ?? []
  const goal = settings?.daily_goal_minutes ?? 240
  const loaded = !!health && !!productive.data && !!nowRows.data
  const model = useMemo(() => (!loaded ? null : buildHome({
    now, dailyGoalMinutes: goal, health: health!, appsNow: nowRows.data!, productive: productive.data, streak: streak.data,
    daysOff: daysOff.data as { day: string }[] | null, tfDaily: tfDaily.data as Row[] | null, tfNow: (tfNow.data?.[0] as Row | undefined) ?? null,
    goals: goals.data as unknown as TaskflowGoalRow[] | null, deadlines: deadlines.data as unknown as TaskflowDeadlineRow[] | null,
    moneyNow: (moneyNow.data?.[0] as Row | undefined) ?? null, hiddenApps,
  })), [loaded, now, goal, health, nowRows.data, productive.data, streak.data, daysOff.data, tfDaily.data, tfNow.data, goals.data, deadlines.data, moneyNow.data, hiddenApps])

  const error = [healthRows, nowRows, productive, streak, tfDaily, tfNow, goals, deadlines, daysOff, moneyNow].map((v) => v.error).find((e) => e) ?? null
  return { model, health, error, now, hiddenApps, cardOrder: settings?.card_order ?? [] }
}
