import { describe, expect, it } from 'vitest'
import { getHole } from '../src/core/courses'
import { dailyHoleName, dailyKey, dailySelection, updateDailyStreak, yesterdayKey } from '../src/core/daily'

describe('daily challenge', () => {
  it('gives everyone the same hole for the same UTC date', () => {
    const date = new Date('2026-11-02T23:30:00Z')
    const a = dailySelection(date)
    const b = dailySelection(new Date('2026-11-02T00:05:00Z'))
    expect(a).toEqual(b)
    expect(a.key).toBe('2026-11-02')
    expect(getHole(a.courseId, a.holeIndex)).toBeDefined()
    expect(dailyHoleName(a).length).toBeGreaterThan(4)
  })

  it('changes the hole from one day to the next', () => {
    const monday = dailySelection(new Date('2026-11-02T12:00:00Z'))
    const tuesday = dailySelection(new Date('2026-11-03T12:00:00Z'))
    expect(monday.key).not.toBe(tuesday.key)
    expect(`${monday.courseId}:${monday.holeIndex}`).not.toBe(`${tuesday.courseId}:${tuesday.holeIndex}`)
  })

  it('handles the UTC month boundary', () => {
    expect(dailyKey(new Date('2026-10-31T23:59:59Z'))).toBe('2026-10-31')
    expect(dailyKey(new Date('2026-11-01T00:00:00Z'))).toBe('2026-11-01')
    expect(yesterdayKey(new Date('2026-11-01T06:00:00Z'))).toBe('2026-10-31')
  })

  it('keeps a streak alive for consecutive days and restarts after a gap', () => {
    const daily = { streak: 0, lastPlayed: '' }
    updateDailyStreak(daily, '2026-11-01')
    expect(daily.streak).toBe(1)
    updateDailyStreak(daily, '2026-11-02')
    expect(daily.streak).toBe(2)
    expect(updateDailyStreak(daily, '2026-11-02')).toBe(false)
    expect(daily.streak).toBe(2)
    updateDailyStreak(daily, '2026-11-05')
    expect(daily.streak).toBe(1)
  })
})
