import { describe, expect, it } from 'vitest'
import { getCourse } from '../src/core/courses'
import { countStars, relativeTotal, scoreLabel, starsForHole, starsToRating, totalPar } from '../src/core/scoring'

describe('score labels', () => {
  it('uses standard golf language', () => {
    expect(scoreLabel(2, 3).label).toBe('Birdie')
    expect(scoreLabel(3, 3).label).toBe('Par')
    expect(scoreLabel(4, 3).label).toBe('Bogey')
    expect(scoreLabel(5, 3).label).toBe('Double bogey')
    expect(scoreLabel(6, 3).label).toBe('Triple bogey')
    expect(scoreLabel(9, 3).label).toBe('+6')
    expect(scoreLabel(2, 4).label).toBe('Eagle')
    expect(scoreLabel(1, 3).label).toBe('Hole in one!')
    expect(scoreLabel(1, 3).relative).toBe(-2)
  })

  it('formats round totals', () => {
    expect(relativeTotal(27, 27)).toBe('E')
    expect(relativeTotal(30, 27)).toBe('+3')
    expect(relativeTotal(24, 27)).toBe('-3')
  })
})

describe('stars', () => {
  it('awards three stars at par, two at par + 1, one otherwise', () => {
    expect(starsForHole({ par: 3 }, 3)).toBe(3)
    expect(starsForHole({ par: 3 }, 2)).toBe(3)
    expect(starsForHole({ par: 3 }, 4)).toBe(2)
    expect(starsForHole({ par: 3 }, 5)).toBe(1)
    expect(starsForHole({ par: 3 }, 12)).toBe(1)
  })

  it('honours per-hole thresholds', () => {
    expect(starsForHole({ par: 4, star3: 4, star2: 6 }, 5)).toBe(2)
    expect(starsForHole({ par: 4, star3: 4, star2: 6 }, 7)).toBe(1)
  })

  it('counts only valid star values', () => {
    expect(countStars({ 0: 3, 1: 2, 2: 99, 3: -4 })).toBe(5)
  })
})

describe('course totals and ratings', () => {
  it('sums the par of a real course', () => {
    const course = getCourse('sunny-meadows')!
    expect(totalPar(course)).toBe(29)
  })

  it('names a gardener by star ratio', () => {
    expect(starsToRating(27, 27)).toBe('Garden legend')
    expect(starsToRating(20, 27)).toBe('Master gardener')
    expect(starsToRating(0, 27)).toBe('Seedling')
    expect(starsToRating(0, 0)).toBe('—')
  })
})
