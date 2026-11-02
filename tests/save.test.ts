import { describe, expect, it } from 'vitest'
import { COURSES } from '../src/core/courses'
import {
  ACHIEVEMENTS,
  courseBestTotal,
  courseProgress,
  createSave,
  isCourseUnlocked,
  migrateSave,
  nextLockedCourse,
  recordHole,
  resetProgress,
  totalStars,
} from '../src/core/save'

describe('save payloads', () => {
  it('creates a complete save with every course represented', () => {
    const save = createSave()
    expect(Object.keys(save.courses)).toHaveLength(COURSES.length)
    expect(save.settings.assist).toBe(true)
    expect(save.achievements).toEqual([])
    expect(totalStars(save)).toBe(0)
  })

  it('migrates junk without throwing', () => {
    expect(() => migrateSave(null)).not.toThrow()
    expect(() => migrateSave('nope')).not.toThrow()
    expect(migrateSave({}).courses).toHaveProperty('sunny-meadows')
  })

  it('keeps good saved values and drops nonsense', () => {
    const save = migrateSave({
      courses: {
        'sunny-meadows': { best: { 0: 2, 1: -4, 2: 'x' }, stars: { 0: 3, 1: 99 } },
      },
      settings: { sound: false },
      achievements: ['first_swing', 'first_swing', 42],
      daily: { best: { '2026-11-02': 3 }, streak: 2, lastPlayed: '2026-11-02', played: 4 },
    })
    expect(save.courses['sunny-meadows'].best[0]).toBe(2)
    expect(save.courses['sunny-meadows'].best[1]).toBeUndefined()
    expect(save.courses['sunny-meadows'].stars[0]).toBe(3)
    expect(save.courses['sunny-meadows'].stars[1]).toBe(3)
    expect(save.settings.sound).toBe(false)
    expect(save.settings.ambience).toBe(true)
    expect(save.achievements).toEqual(['first_swing'])
    expect(save.daily.streak).toBe(2)
  })
})

describe('recording a hole', () => {
  it('stores stars, a personal best and first achievements', () => {
    const save = createSave()
    const result = recordHole(save, 'sunny-meadows', 0, 2, 'journey')
    expect(result.stars).toBe(3)
    expect(result.isBest).toBe(true)
    expect(result.previousBest).toBeNull()
    expect(courseProgress(save, 'sunny-meadows').best[0]).toBe(2)
    expect(save.achievements).toContain('first_swing')
    expect(save.achievements).not.toContain('first_birdie')
    expect(save.stats.holesPlayed).toBe(1)

    // Hole 3 is a par 3, so two strokes is a birdie.
    recordHole(save, 'sunny-meadows', 2, 2, 'journey')
    expect(save.achievements).toContain('first_birdie')
  })

  it('never lowers a star rating on a worse replay', () => {
    const save = createSave()
    recordHole(save, 'sunny-meadows', 0, 2, 'free')
    const second = recordHole(save, 'sunny-meadows', 0, 6, 'free')
    expect(second.stars).toBe(1)
    expect(second.isBest).toBe(false)
    expect(courseProgress(save, 'sunny-meadows').stars[0]).toBe(3)
    expect(courseProgress(save, 'sunny-meadows').best[0]).toBe(2)
  })

  it('unlocks the next course once enough stars are banked', () => {
    const save = createSave()
    expect(isCourseUnlocked(save, 'mushroom-grove')).toBe(false)
    expect(nextLockedCourse(save)?.id).toBe('mushroom-grove')

    for (let hole = 0; hole < 9; hole += 1) recordHole(save, 'sunny-meadows', hole, 2, 'journey')
    expect(totalStars(save)).toBe(27)
    expect(isCourseUnlocked(save, 'mushroom-grove')).toBe(true)
    expect(save.achievements).toContain('meadow_clear')
    expect(save.achievements).not.toContain('star_collector')
  })

  it('banks the star collector achievement at sixty stars', () => {
    const save = createSave()
    for (const courseId of ['sunny-meadows', 'mushroom-grove', 'lily-pond']) {
      for (let hole = 0; hole < 9; hole += 1) recordHole(save, courseId, hole, 2, 'journey')
    }
    expect(totalStars(save)).toBe(81)
    expect(save.achievements).toContain('star_collector')
  })

  it('tracks a course best only when every hole has a score', () => {
    const save = createSave()
    expect(courseBestTotal(save, 'sunny-meadows')).toBeNull()
    for (let hole = 0; hole < 9; hole += 1) recordHole(save, 'sunny-meadows', hole, 3, 'journey')
    expect(courseBestTotal(save, 'sunny-meadows')).toBe(27)
  })

  it('counts daily plays for the daily achievement', () => {
    const save = createSave()
    recordHole(save, 'sunny-meadows', 0, 3, 'daily')
    recordHole(save, 'sunny-meadows', 1, 3, 'daily')
    recordHole(save, 'sunny-meadows', 2, 3, 'daily')
    expect(save.achievements).toContain('daily_three')
  })

  it('keeps progress but resets stats when progress is reset', () => {
    const save = createSave()
    recordHole(save, 'sunny-meadows', 0, 2, 'journey')
    save.settings.sound = false
    const fresh = resetProgress(save)
    expect(fresh.settings.sound).toBe(false)
    expect(totalStars(fresh)).toBe(0)
    expect(fresh.stats.holesPlayed).toBe(0)
  })
})

describe('achievement catalogue', () => {
  it('has unique ids and readable copy', () => {
    const ids = ACHIEVEMENTS.map((entry) => entry.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const entry of ACHIEVEMENTS) {
      expect(entry.name.length).toBeGreaterThan(2)
      expect(entry.description.length).toBeGreaterThan(8)
    }
  })
})
