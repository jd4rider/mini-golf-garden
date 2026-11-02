import type { CourseDefinition, HoleDefinition } from './types'

export interface ScoreLabel {
  label: string
  /** Short score relative to par, e.g. −1 for a birdie. */
  relative: number
  tone: 'great' | 'good' | 'par' | 'poor'
}

export function scoreLabel(strokes: number, par: number): ScoreLabel {
  if (strokes === 1) return { label: 'Hole in one!', relative: 1 - par, tone: 'great' }
  const relative = strokes - par
  if (relative <= -3) return { label: 'Albatross', relative, tone: 'great' }
  if (relative === -2) return { label: 'Eagle', relative, tone: 'great' }
  if (relative === -1) return { label: 'Birdie', relative, tone: 'great' }
  if (relative === 0) return { label: 'Par', relative, tone: 'par' }
  if (relative === 1) return { label: 'Bogey', relative, tone: 'poor' }
  if (relative === 2) return { label: 'Double bogey', relative, tone: 'poor' }
  if (relative === 3) return { label: 'Triple bogey', relative, tone: 'poor' }
  return { label: `+${relative}`, relative, tone: 'poor' }
}

/** Plain-text score for a total round, e.g. "E" or "+4". */
export function relativeTotal(strokes: number, par: number): string {
  const relative = strokes - par
  if (relative === 0) return 'E'
  return relative > 0 ? `+${relative}` : `${relative}`
}

export function starsForHole(hole: Pick<HoleDefinition, 'par' | 'star3' | 'star2'>, strokes: number): number {
  const three = hole.star3 ?? hole.par
  const two = hole.star2 ?? hole.par + 1
  if (strokes <= three) return 3
  if (strokes <= two) return 2
  return 1
}

export function totalPar(course: CourseDefinition): number {
  return course.holes.reduce((sum, hole) => sum + hole.par, 0)
}

export function countStars(stars: Record<string, number>): number {
  let total = 0
  for (const value of Object.values(stars)) {
    // Ignore corrupt values rather than letting one bad save inflate the total.
    if (Number.isFinite(value) && value >= 0 && value <= 3) total += value
  }
  return total
}

export function starsToRating(stars: number, total: number): string {
  if (total <= 0) return '—'
  const ratio = stars / total
  if (ratio >= 0.95) return 'Garden legend'
  if (ratio >= 0.72) return 'Master gardener'
  if (ratio >= 0.55) return 'Green keeper'
  if (ratio >= 0.33) return 'Weekend golfer'
  return 'Seedling'
}

export function formatPar(par: number): string {
  return par === 1 ? 'Par 1' : `Par ${par}`
}
