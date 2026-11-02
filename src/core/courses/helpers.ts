import { GRID_COLS, GRID_ROWS } from '../constants'
import type { CourseDefinition, HoleDefinition } from '../types'

/**
 * Normalises a hand-authored ASCII hole:
 *  - pads short rows with grass and missing rows with grass
 *  - seals the outer border with hedge
 *  - rejects rows that are too wide (a real authoring mistake)
 *
 * Being forgiving about length means a designer can sketch a hole without
 * counting characters, while the border guarantee keeps the ball on the board.
 */
export function normalizeGrid(rows: readonly string[], label: string): string[] {
  if (rows.length > GRID_ROWS) {
    throw new Error(`${label}: ${rows.length} rows (max ${GRID_ROWS})`)
  }
  const out: string[] = []
  for (let row = 0; row < GRID_ROWS; row += 1) {
    let text = rows[row] ?? ''
    if (text.length > GRID_COLS) {
      throw new Error(`${label}: row ${row} has ${text.length} columns (max ${GRID_COLS})`)
    }
    text = text.padEnd(GRID_COLS, '.')
    out.push(text)
  }
  out[0] = '#'.repeat(GRID_COLS)
  out[GRID_ROWS - 1] = '#'.repeat(GRID_COLS)
  for (let row = 1; row < GRID_ROWS - 1; row += 1) {
    out[row] = `#${out[row].slice(1, GRID_COLS - 1)}#`
  }
  return out
}

export function hole(spec: HoleDefinition): HoleDefinition {
  return { ...spec, grid: normalizeGrid(spec.grid, spec.name) }
}

export function course(spec: CourseDefinition): CourseDefinition {
  return { ...spec, holes: spec.holes.map(hole) }
}
