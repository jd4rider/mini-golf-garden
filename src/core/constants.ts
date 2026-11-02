/**
 * Shared physical constants. Everything here is in logical pixels and seconds.
 * The playfield is 24 x 16 tiles of 40px, drawn 1:1 into a 960x640 canvas.
 */

export const CELL = 40
export const GRID_COLS = 24
export const GRID_ROWS = 16
export const FIELD_W = CELL * GRID_COLS
export const FIELD_H = CELL * GRID_ROWS

/** Simulation runs on a fixed step so a shot is identical on every device. */
export const FIXED_DT = 1 / 120
export const MAX_FRAME_STEPS = 8

export const BALL_R = 6.8
export const HOLE_R = 12.5

/** The ball only drops when it is slow enough; faster balls lip over the cup. */
export const CAPTURE_SPEED = 610
/** Inside this radius a slow ball is pulled toward the cup — the satisfying "will it drop". */
export const CUP_GRAVITY_RADIUS = 34
export const CUP_GRAVITY = 1250

export const STOP_SPEED = 15
export const MIN_BOUNCE_SPEED = 26

export const SHOT_MIN = 150
export const SHOT_MAX = 1010
export const MAX_BALL_SPEED = 1500

export const WALL_RESTITUTION = 0.64
export const WALL_TANGENT_KEEP = 0.95
export const BUMPER_RESTITUTION = 1.06
export const WALL_THICKNESS = 0.55

export const DEFAULT_STAR_3 = 0
export const DEFAULT_STAR_2 = 1

/** Strokes over par before a hole is conceded so nobody is ever trapped. */
export const CONCEDE_OVER_PAR = 6
