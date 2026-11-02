import type { CourseDefinition, HoleDefinition } from '../types'
import { autumnOrchard } from './autumn-orchard'
import { crystalGarden } from './crystal-garden'
import { lilyPond } from './lily-pond'
import { moonlightGarden } from './moonlight-garden'
import { mushroomGrove } from './mushroom-grove'
import { royalGarden } from './royal-garden'
import { sunnyMeadows } from './sunny-meadows'
import { windmillValley } from './windmill-valley'

/** Course order is also the journey order and the unlock ladder. */
export const COURSES: CourseDefinition[] = [
  sunnyMeadows,
  mushroomGrove,
  lilyPond,
  windmillValley,
  crystalGarden,
  autumnOrchard,
  moonlightGarden,
  royalGarden,
]

export const TOTAL_HOLES = COURSES.reduce((sum, course) => sum + course.holes.length, 0)

export function getCourse(id: string): CourseDefinition | undefined {
  return COURSES.find((course) => course.id === id)
}

export function getHole(courseId: string, holeIndex: number): HoleDefinition | undefined {
  return getCourse(courseId)?.holes[holeIndex]
}

export function courseIndex(courseId: string): number {
  return COURSES.findIndex((course) => course.id === courseId)
}

export function nextCourse(courseId: string): CourseDefinition | null {
  const index = courseIndex(courseId)
  if (index < 0 || index + 1 >= COURSES.length) return null
  return COURSES[index + 1]
}

export const GRID_LEGEND = [
  ['#', 'wall / hedge'],
  ['.', 'grass'],
  [',', 'rough grass'],
  [':', 'smooth stone'],
  ['s', 'sand'],
  ['m', 'mud'],
  ['i', 'ice'],
  ['~', 'water'],
  ['b', 'wooden bridge'],
  ['t', 'stone tunnel'],
  ['>', 'conveyor east'],
  ['<', 'conveyor west'],
  ['^', 'conveyor north'],
  ['v', 'conveyor south'],
  ['T', 'tee'],
  ['H', 'hole'],
] as const
