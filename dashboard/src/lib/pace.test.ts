// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { dayFraction, goalRing } from './pace'

const at = (h: number, m = 0) => h * 60 + m
const ring = (minutes: number | null, now: number, isDayOff = false, goalMinutes = 240) => goalRing({ minutes, goalMinutes, minutesIntoDay: now, isDayOff })

describe('dayFraction', () => {
  it('is 0 before 08:00, linear to 22:00, then 1', () => {
    expect(dayFraction(at(7, 59))).toBe(0)
    expect(dayFraction(at(8))).toBe(0)
    expect(dayFraction(at(15))).toBe(0.5)
    expect(dayFraction(at(22))).toBe(1)
    expect(dayFraction(at(23, 30))).toBe(1)
  })
})

describe('goalRing', () => {
  it('no data is not zero', () => {
    expect(ring(null, at(12))).toEqual({ state: 'no-data', minutes: null, goal: 240, percent: 0, label: 'No data', hint: null })
  })
  it('in progress: percent, time left, and on pace / behind by time of day', () => {
    // 15:00 is half the window: the goal would be at 120 min; on pace from 108 min (90%)
    expect(ring(120, at(15))).toMatchObject({ state: 'in-progress', percent: 50, label: '2h 00m left', hint: 'on-pace' })
    expect(ring(108, at(15)).hint).toBe('on-pace')
    expect(ring(107, at(15)).hint).toBe('behind')
    expect(ring(0, at(15)).hint).toBe('behind')
  })
  it('no hint before the waking window starts; at 22:00 anything short of the goal is behind', () => {
    expect(ring(0, at(7, 30)).hint).toBeNull()
    expect(ring(200, at(22, 30))).toMatchObject({ hint: 'behind', label: '40m left' })
  })
  it('reached: label says so, no hint, percent capped', () => {
    expect(ring(300, at(9))).toEqual({ state: 'reached', minutes: 300, goal: 240, percent: 100, label: 'Goal reached', hint: null })
    expect(ring(240, at(9)).state).toBe('reached')
  })
  it('a day off says "Day off" with no pace hint and never "behind", even at 0 late in the day', () => {
    expect(ring(0, at(21), true)).toMatchObject({ state: 'day-off', label: 'Day off', hint: null, percent: 0 })
    expect(ring(300, at(21), true)).toMatchObject({ state: 'day-off', label: 'Day off', hint: null, minutes: 300 })
  })
  it('a different goal changes the numbers', () => {
    expect(ring(30, at(15), false, 60)).toMatchObject({ percent: 50, label: '30m left', hint: 'on-pace' })
  })
})
