/**
 * Course validator.
 *
 * Every hole is checked structurally (sizes, tee, cup, obstacles) and for
 * connectivity using the same solids the physics engine builds. It also fires a
 * spread of real simulated putts at the cup so a hole that cannot be reached by
 * any shot is reported before it ever reaches a player.
 */

import { BALL_R, CELL, GRID_COLS, GRID_ROWS } from './constants'
import { COURSES, getCourse } from './courses'
import type { HoleDefinition } from './types'
import { buildStaticWorld, isSolidAt, isWaterAt, simulateShot, surfaceAt, type StaticWorld } from './world'

export interface HoleReport {
  courseId: string
  courseName: string
  holeIndex: number
  holeName: string
  errors: string[]
  warnings: string[]
  /** A straight putt from the tee found the cup. */
  directPutt: boolean
  /** Some simulated shot got close enough that the next putt is routine. */
  approachable: boolean
  /** At least one stock putt travelled three cells: the tee is not boxed in. */
  escaped: boolean
  /** Closest a stock shot came to the cup, in cells. */
  closestApproach: number
}

function countChar(grid: string[], char: string): number {
  let count = 0
  for (const row of grid) for (const cell of row) if (cell === char) count += 1
  return count
}

function findChar(grid: string[], char: string): { col: number; row: number } {
  for (let row = 0; row < grid.length; row += 1) {
    const col = grid[row].indexOf(char)
    if (col >= 0) return { col, row }
  }
  return { col: -1, row: -1 }
}

/** Free-cell flood fill, ignoring water (a bridge or raft may cover it). */
function reachableCells(world: StaticWorld, start: { col: number; row: number }): Set<number> {
  const seen = new Set<number>()
  const queue: { col: number; row: number }[] = [start]
  seen.add(start.row * GRID_COLS + start.col)
  while (queue.length) {
    const { col, row } = queue.pop()!
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ]) {
      const c = col + dc
      const r = row + dr
      if (c < 0 || r < 0 || c >= GRID_COLS || r >= GRID_ROWS) continue
      const key = r * GRID_COLS + c
      if (seen.has(key)) continue
      if (world.surfaces[r][c] === 'solid') continue
      seen.add(key)
      queue.push({ col: c, row: r })
    }
  }
  return seen
}

/** Is a ball-sized disc free at this point? */
function clearanceFree(world: StaticWorld, x: number, y: number): boolean {
  const samples = 8
  if (isSolidAt(world, x, y)) return false
  for (let i = 0; i < samples; i += 1) {
    const angle = (i / samples) * Math.PI * 2
    if (isSolidAt(world, x + Math.cos(angle) * (BALL_R + 2), y + Math.sin(angle) * (BALL_R + 2))) return false
  }
  return true
}

function checkObstacle(hole: HoleDefinition, problems: string[]): void {
  for (const obstacle of hole.obstacles ?? []) {
    if (!Number.isFinite(obstacle.x) || !Number.isFinite(obstacle.y)) {
      problems.push(`obstacle ${obstacle.type} has no position`)
      continue
    }
    const x = obstacle.x * CELL
    const y = obstacle.y * CELL
    if (x < CELL || y < CELL || x > (GRID_COLS - 1) * CELL || y > (GRID_ROWS - 1) * CELL) {
      problems.push(`obstacle ${obstacle.type} sits outside the garden`)
    }
    if ('period' in obstacle && (!Number.isFinite(obstacle.period) || obstacle.period <= 0)) {
      problems.push(`obstacle ${obstacle.type} has a non-positive period`)
    }
    if ('radius' in obstacle && obstacle.radius !== undefined && obstacle.radius <= 0) {
      problems.push(`obstacle ${obstacle.type} has a non-positive radius`)
    }
  }
}

export function validateHole(
  courseId: string,
  courseName: string,
  holeIndex: number,
  hole: HoleDefinition,
): HoleReport {
  const errors: string[] = []
  const warnings: string[] = []

  if (hole.grid.length !== GRID_ROWS) errors.push(`${hole.grid.length} rows, expected ${GRID_ROWS}`)
  hole.grid.forEach((row, index) => {
    if (row.length !== GRID_COLS) errors.push(`row ${index} has ${row.length} columns, expected ${GRID_COLS}`)
  })
  if (errors.length) {
    return {
      courseId,
      courseName,
      holeIndex,
      holeName: hole.name,
      errors,
      warnings,
      directPutt: false,
      approachable: false,
      escaped: false,
      closestApproach: 99,
    }
  }

  for (let col = 0; col < GRID_COLS; col += 1) {
    if (hole.grid[0][col] !== '#' || hole.grid[GRID_ROWS - 1][col] !== '#') {
      errors.push(`top/bottom border is open at column ${col}`)
      break
    }
  }
  for (let row = 0; row < GRID_ROWS; row += 1) {
    if (hole.grid[row][0] !== '#' || hole.grid[row][GRID_COLS - 1] !== '#') {
      errors.push(`left/right border is open at row ${row}`)
      break
    }
  }

  if (countChar(hole.grid, 'T') !== 1) errors.push(`found ${countChar(hole.grid, 'T')} tees, expected 1`)
  if (countChar(hole.grid, 'H') !== 1) errors.push(`found ${countChar(hole.grid, 'H')} cups, expected 1`)
  if (!Number.isFinite(hole.par) || hole.par < 2 || hole.par > 6) errors.push(`par ${hole.par} is outside 2..6`)
  if (!hole.name || hole.name.trim().length === 0) errors.push('hole has no name')
  if (errors.length) {
    return {
      courseId,
      courseName,
      holeIndex,
      holeName: hole.name,
      errors,
      warnings,
      directPutt: false,
      approachable: false,
      escaped: false,
      closestApproach: 99,
    }
  }

  const world = buildStaticWorld(hole)
  const tee = findChar(hole.grid, 'T')
  const cup = findChar(hole.grid, 'H')

  if (!clearanceFree(world, world.tee.x, world.tee.y)) errors.push('the tee is tight against a wall')
  if (!clearanceFree(world, world.cup.x, world.cup.y)) errors.push('the cup is tight against a wall')
  if (surfaceAt(world, world.cup.x, world.cup.y) === 'water') errors.push('the cup is under water')
  if (surfaceAt(world, world.cup.x, world.cup.y) === 'solid') errors.push('the cup is inside a wall')
  if (surfaceAt(world, world.tee.x, world.tee.y) === 'water') errors.push('the tee is under water')

  const reachable = reachableCells(world, tee)
  if (!reachable.has(cup.row * GRID_COLS + cup.col)) {
    errors.push('no walking route from tee to cup')
  }

  for (const obstacle of hole.obstacles ?? []) {
    if (isSolidAt(world, obstacle.x * CELL, obstacle.y * CELL)) {
      errors.push(`obstacle ${obstacle.type} is buried inside a wall`)
    }
  }
  checkObstacle(hole, errors)

  // Distance sanity: a 1-2 cell putt is not a golf hole.
  const distance = Math.hypot(world.cup.x - world.tee.x, world.cup.y - world.tee.y)
  if (distance < CELL * 2.5) warnings.push(`tee and cup are only ${(distance / CELL).toFixed(1)} cells apart`)

  // Fire a small spread of real putts from the tee. This is a smoke test for the
  // hole's line, not a proof: a par 4 needs more than one stroke by design.
  let sankAny = false
  let directPutt = false
  let closestApproach = Number.POSITIVE_INFINITY
  let farthest = 0
  const baseAngle = Math.atan2(world.cup.y - world.tee.y, world.cup.x - world.tee.x)
  const offsets = [0, -0.07, 0.07, -0.16, 0.16, -0.28, 0.28, -0.44, 0.44, -0.62, 0.62]

  search: for (const offset of offsets) {
    for (const speed of [620, 1000]) {
      const result = simulateShot(
        world,
        { x: world.tee.x, y: world.tee.y },
        Math.cos(baseAngle + offset) * speed,
        Math.sin(baseAngle + offset) * speed,
        { maxTime: 4 },
      )
      if (result.sunk) {
        sankAny = true
        directPutt = offset === 0
        closestApproach = 0
        break search
      }
      closestApproach = Math.min(closestApproach, Math.hypot(result.x - world.cup.x, result.y - world.cup.y) / CELL)
      farthest = Math.max(farthest, Math.hypot(result.x - world.tee.x, result.y - world.tee.y) / CELL)
    }
  }

  // A single stock putt should cross most of the garden. If it cannot get within
  // twelve cells, the tee is probably boxed in or the hole is walled off.
  const approachable = sankAny || closestApproach <= 12
  if (!approachable) warnings.push('no stock putt reached the far half of the hole — check the tee line')
  if (!directPutt && distance < CELL * 9) warnings.push('short hole with no clean straight putt — check the line')

  // Water on the direct line with no bridge/pad is a hint that the hole is harsh.
  if (isWaterAt(world, (world.tee.x + world.cup.x) / 2, (world.tee.y + world.cup.y) / 2)) {
    warnings.push('the centre of the hole is water — confirm a dry route exists')
  }

  return {
    courseId,
    courseName,
    holeIndex,
    holeName: hole.name,
    errors,
    warnings,
    directPutt,
    approachable,
    escaped: farthest >= 3,
    closestApproach: Number.isFinite(closestApproach) ? Number(closestApproach.toFixed(2)) : 99,
  }
}

export function validateCourses(): HoleReport[] {
  const reports: HoleReport[] = []
  for (const course of COURSES) {
    if (course.holes.length !== 9) {
      reports.push({
        courseId: course.id,
        courseName: course.name,
        holeIndex: -1,
        holeName: course.name,
        errors: [`course has ${course.holes.length} holes, expected 9`],
        warnings: [],
        directPutt: false,
        approachable: false,
        escaped: false,
        closestApproach: 99,
      })
    }
    course.holes.forEach((hole, index) => reports.push(validateHole(course.id, course.name, index, hole)))
  }
  return reports
}

export function courseReport(courseId: string): HoleReport[] {
  const course = getCourse(courseId)
  if (!course) return []
  return course.holes.map((hole, index) => validateHole(course.id, course.name, index, hole))
}
