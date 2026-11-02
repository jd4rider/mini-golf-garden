/** Course, obstacle and play-mode types. No Phaser or DOM types in here. */

export type ThemeId =
  | 'meadow'
  | 'grove'
  | 'pond'
  | 'windmill'
  | 'crystal'
  | 'orchard'
  | 'moonlight'
  | 'royal'

/** Terrain a tile can hold. `solid` and `void` stop the ball. */
export type SurfaceId =
  | 'grass'
  | 'rough'
  | 'stone'
  | 'sand'
  | 'mud'
  | 'ice'
  | 'water'
  | 'wood'
  | 'tunnel'
  | 'conveyorE'
  | 'conveyorW'
  | 'conveyorN'
  | 'conveyorS'
  | 'solid'
  | 'void'

/** Point obstacles use x/y as the centre; box obstacles use x/y as the centre too. */
export interface ObstacleBase {
  /** Free-form designer label, also used by trick-shot objectives. */
  tag?: string
}

export interface WindmillObstacle extends ObstacleBase {
  type: 'windmill'
  x: number
  y: number
  /** Blade length in cells. */
  radius: number
  /** Radians per second. Negative spins the other way. */
  speed: number
  phase?: number
  blades?: number
}

export interface GateObstacle extends ObstacleBase {
  type: 'gate'
  x: number
  y: number
  w: number
  h: number
  /** How far the gate slides, in cells. */
  travel: number
  period: number
  phase?: number
  axis?: 'x' | 'y'
}

export interface PlatformObstacle extends ObstacleBase {
  type: 'platform'
  x: number
  y: number
  w: number
  h: number
  dx: number
  dy: number
  period: number
  phase?: number
}

export interface BumperObstacle extends ObstacleBase {
  type: 'bumper'
  x: number
  y: number
  radius: number
}

export interface TeleporterObstacle extends ObstacleBase {
  type: 'teleporter'
  x: number
  y: number
  tx: number
  ty: number
  radius?: number
}

export interface FountainObstacle extends ObstacleBase {
  type: 'fountain'
  x: number
  y: number
  radius: number
  period: number
  phase?: number
}

export interface SpringObstacle extends ObstacleBase {
  type: 'spring'
  x: number
  y: number
  /** Launch direction in degrees (0 = right, 90 = down). */
  angle: number
  /** Launch speed in px/s. */
  power: number
  radius?: number
}

export interface WindObstacle extends ObstacleBase {
  type: 'wind'
  x: number
  y: number
  w: number
  h: number
  /** Acceleration in px/s². */
  ax: number
  ay: number
}

export interface LilyObstacle extends ObstacleBase {
  type: 'lily'
  x: number
  y: number
  radius: number
  dx: number
  dy: number
  period: number
  phase?: number
}

export interface LogObstacle extends ObstacleBase {
  type: 'log'
  x: number
  y: number
  w: number
  h: number
  dx: number
  dy: number
  period: number
  phase?: number
}

export interface SpinLogObstacle extends ObstacleBase {
  type: 'spinlog'
  x: number
  y: number
  length: number
  speed: number
  phase?: number
}

export interface BeeObstacle extends ObstacleBase {
  type: 'bee'
  x: number
  y: number
  dx: number
  dy: number
  period: number
  phase?: number
  radius?: number
}

export interface SlopeObstacle extends ObstacleBase {
  type: 'slope'
  x: number
  y: number
  w: number
  h: number
  ax: number
  ay: number
}

/** Purely decorative arch: the ball rolls underneath it, nothing collides. */
export interface TunnelObstacle extends ObstacleBase {
  type: 'tunnel'
  x: number
  y: number
  w: number
  h: number
}

export type Obstacle =
  | WindmillObstacle
  | GateObstacle
  | PlatformObstacle
  | BumperObstacle
  | TeleporterObstacle
  | FountainObstacle
  | SpringObstacle
  | WindObstacle
  | LilyObstacle
  | LogObstacle
  | SpinLogObstacle
  | BeeObstacle
  | SlopeObstacle
  | TunnelObstacle

/** An angled wall, given in cell coordinates. Optional flair over the tile walls. */
export interface AngledWall {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Half-thickness in cells. Default 0.28. */
  width?: number
}

export interface HoleDefinition {
  name: string
  par: number
  /** 16 rows of 24 characters. See GRID_LEGEND in courses/index.ts. */
  grid: string[]
  obstacles?: Obstacle[]
  walls?: AngledWall[]
  /** Strokes at or under which the hole awards three stars. Defaults to par. */
  star3?: number
  /** Strokes at or under which the hole awards two stars. Defaults to par + 1. */
  star2?: number
  hint?: string
}

export interface CourseDefinition {
  id: string
  name: string
  tagline: string
  theme: ThemeId
  /** CSS gradient used by the menu cards. */
  colors: [string, string]
  /** Stars needed before the course opens up. */
  starsRequired: number
  holes: HoleDefinition[]
}

export interface ChallengeObjective {
  kind: 'bounceWalls' | 'hitBumper' | 'useTeleporter' | 'strokesExactly' | 'noSand' | 'holeInOne'
  count?: number
}

export interface TrickShot {
  id: string
  name: string
  description: string
  courseId: string
  holeIndex: number
  objective: ChallengeObjective
}

export type GameMode = 'journey' | 'free' | 'daily' | 'timeattack' | 'trick' | 'zen'

export interface HoleScore {
  strokes: number
  par: number
  stars: number
  best: number
  /** True when the player finished within the stroke limit. */
  completed: boolean
}

export interface RoundState {
  mode: GameMode
  courseId: string
  holeIndex: number
  /** Ordered hole indices for this round. */
  order: number[]
  strokes: number
  totalStrokes: number
  totalPar: number
  startedAt: number
  /** Per-hole results for the round in progress. */
  results: HoleScore[]
  trickId?: string
}
