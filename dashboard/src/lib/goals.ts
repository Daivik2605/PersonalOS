// Presentation of TaskFlow's goals (SPEC §3.1, §3.2). Rows come from `taskflow_dashboard_goals`: one row per goal per period, the
// current period plus the last 12, judged by TaskFlow against the goal version in force then. Home never judges a goal itself:
// it reads `hit` and shows it. Rows are one user's.
import type { TaskflowGoalRow } from './contract'
import { timerLink } from './apps'
import { formatDuration, type Day } from './time'

export type GoalState =
  | 'hit'          // at-least goal reached (current or past period)
  | 'in-progress'  // at-least goal, current period, not reached yet
  | 'missed'       // at-least goal, past period, not reached
  | 'within'       // at-most limit, not exceeded so far (or the whole period, when past)
  | 'warning'      // at-most limit, current period, 80% or more of the limit used
  | 'over'         // at-most limit exceeded

export interface GoalView {
  id: string
  name: string
  period: TaskflowGoalRow['period']
  periodStart: Day
  periodEnd: Day
  targetLabel: string
  direction: TaskflowGoalRow['direction']
  progress: number
  amount: number
  /** 0..100, capped; for an at-most goal it is the share of the limit used. */
  percent: number
  state: GoalState
  paused: boolean
  /** "25 / 60 min", "3 / 5", "2 / 3". */
  progressText: string
  /** Path inside TaskFlow (`/timer?tag=…` for time goals, `/goals` otherwise). */
  link: string
}

export const WARN_AT = 0.8

function unitText(metric: string, value: number): string {
  return metric === 'tag_minutes' ? formatDuration(value) : String(value)
}

export function goalView(g: TaskflowGoalRow, today: Day): GoalView {
  const current = g.period_start <= today && today <= g.period_end
  const share = g.amount > 0 ? g.progress / g.amount : 0
  let state: GoalState
  if (g.direction === 'at_least') state = g.hit ? 'hit' : current ? 'in-progress' : 'missed'
  else state = !g.hit ? 'over' : current && share >= WARN_AT ? 'warning' : 'within'
  return {
    id: g.goal_id, name: g.name, period: g.period, periodStart: g.period_start, periodEnd: g.period_end, targetLabel: g.target_label,
    direction: g.direction, progress: g.progress, amount: g.amount, percent: Math.max(0, Math.min(100, Math.round(share * 100))), state, paused: g.paused,
    progressText: `${unitText(g.metric, g.progress)} / ${unitText(g.metric, g.amount)}`,
    link: g.metric === 'tag_minutes' ? timerLink(g.name) : '/goals',
  }
}

/** The goals whose current period contains `today`, not paused first-class (paused ones are returned flagged), daily before weekly before monthly. */
export function currentGoals(rows: TaskflowGoalRow[], today: Day): GoalView[] {
  const order = { day: 0, week: 1, month: 2 } as const
  return rows
    .filter((g) => g.period_start <= today && today <= g.period_end)
    .map((g) => goalView(g, today))
    .sort((a, b) => order[a.period] - order[b.period] || a.name.localeCompare(b.name))
}

/** A goal's recent periods, oldest first (for hit / missed history). */
export function goalHistory(rows: TaskflowGoalRow[], goalId: string, today: Day): GoalView[] {
  return rows.filter((g) => g.goal_id === goalId).map((g) => goalView(g, today)).sort((a, b) => a.periodStart.localeCompare(b.periodStart))
}

/** Hit / missed count over the finished periods of the goals in `period` (the current period is still open and not counted). */
export function hitCount(rows: TaskflowGoalRow[], period: TaskflowGoalRow['period'], today: Day): { hit: number; total: number } {
  const done = rows.filter((g) => g.period === period && g.period_end < today && !g.paused)
  return { hit: done.filter((g) => g.hit).length, total: done.length }
}
