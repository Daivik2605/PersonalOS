// The goal ring on Home (SPEC §3.1): progress against the daily productive goal, "Xh left", and an on-pace / behind hint.
// Pace is linear over a fixed waking window, 08:00-22:00 Toronto time (decision 2026-10-25; not a setting).
import { formatDuration } from './time'

export const WAKE_START = 8 * 60
export const WAKE_END = 22 * 60
/** On pace = at least this share of the minutes the goal would have reached by now. */
export const ON_PACE_SHARE = 0.9

export type PaceHint = 'on-pace' | 'behind' | null
export type RingState = 'no-data' | 'day-off' | 'reached' | 'in-progress'

export interface GoalRing {
  state: RingState
  /** Productive minutes today; null while no app has published (never a fake 0). */
  minutes: number | null
  goal: number
  /** 0..100, capped. 0 when there is no data. */
  percent: number
  /** "2h 05m left", "Goal reached", "Day off", or "No data". */
  label: string
  /** Null on a day off, once reached, before the waking window, and with no data. */
  hint: PaceHint
}

/** Share of the waking window that has passed: 0 before 08:00, 1 from 22:00. */
export function dayFraction(minutesIntoDay: number): number {
  return Math.min(1, Math.max(0, (minutesIntoDay - WAKE_START) / (WAKE_END - WAKE_START)))
}

export function goalRing(p: { minutes: number | null; goalMinutes: number; minutesIntoDay: number; isDayOff: boolean }): GoalRing {
  const { minutes, goalMinutes: goal } = p
  if (minutes === null) return { state: 'no-data', minutes: null, goal, percent: 0, label: 'No data', hint: null }
  const percent = Math.min(100, Math.round((minutes / goal) * 100))
  // A day off has no goal to fall behind on: no pace hint and never "behind", whatever was done.
  if (p.isDayOff) return { state: 'day-off', minutes, goal, percent, label: 'Day off', hint: null }
  if (minutes >= goal) return { state: 'reached', minutes, goal, percent: 100, label: 'Goal reached', hint: null }
  const f = dayFraction(p.minutesIntoDay)
  const hint: PaceHint = f === 0 ? null : minutes >= goal * f * ON_PACE_SHARE ? 'on-pace' : 'behind'
  return { state: 'in-progress', minutes, goal, percent, label: `${formatDuration(goal - minutes)} left`, hint }
}
