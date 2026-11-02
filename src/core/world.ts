/**
 * Deterministic miniature-golf physics.
 *
 * Deliberately independent of Phaser: the renderer only reads `World.ball` and
 * drains events. Everything runs on a fixed 120 Hz step, with sub-stepping for
 * fast balls so nothing tunnels through a hedge.
 *
 * Geometry is a 24x16 tile grid (walls merged into horizontal runs) plus optional
 * angled wall capsules and circular bumpers. Moving obstacles are computed as a
 * pure function of time, which keeps replays and the daily challenge identical.
 */

import {
  BALL_R,
  BUMPER_RESTITUTION,
  CAPTURE_SPEED,
  CELL,
  CUP_GRAVITY,
  CUP_GRAVITY_RADIUS,
  FIXED_DT,
  GRID_COLS,
  GRID_ROWS,
  HOLE_R,
  MAX_BALL_SPEED,
  MAX_FRAME_STEPS,
  MIN_BOUNCE_SPEED,
  STOP_SPEED,
  WALL_RESTITUTION,
  WALL_TANGENT_KEEP,
} from './constants'
import { closestOnSegment, clamp, type Vec } from './math'
import type { HoleDefinition, Obstacle, SurfaceId } from './types'

export interface Rect {
  x: number
  y: number
  w: number
  h: number
}

export interface CircleCollider {
  x: number
  y: number
  r: number
}

export interface CapsuleCollider {
  ax: number
  ay: number
  bx: number
  by: number
  r: number
}

export interface StaticWorld {
  hole: HoleDefinition
  surfaces: SurfaceId[][]
  chars: string[][]
  solids: Rect[]
  segments: CapsuleCollider[]
  bumpers: CircleCollider[]
  water: Uint8Array
  tee: Vec
  cup: Vec
}

export interface BallState {
  x: number
  y: number
  vx: number
  vy: number
}

export type WorldEventKind =
  | 'wall'
  | 'bumper'
  | 'water'
  | 'sink'
  | 'stop'
  | 'teleport'
  | 'spring'
  | 'bee'
  | 'fountain'
  | 'conveyor'

export interface WorldEvent {
  kind: WorldEventKind
  x: number
  y: number
  strength?: number
}

export interface SurfaceInfo {
  decel: number
  water?: boolean
  solid?: boolean
  push?: Vec
}

export const SURFACES: Record<SurfaceId, SurfaceInfo> = {
  grass: { decel: 700 },
  rough: { decel: 1010 },
  stone: { decel: 405 },
  sand: { decel: 2450 },
  mud: { decel: 3050 },
  ice: { decel: 105 },
  water: { decel: 900, water: true },
  wood: { decel: 640 },
  tunnel: { decel: 700 },
  conveyorE: { decel: 660, push: { x: 330, y: 0 } },
  conveyorW: { decel: 660, push: { x: -330, y: 0 } },
  conveyorN: { decel: 660, push: { x: 0, y: -330 } },
  conveyorS: { decel: 660, push: { x: 0, y: 330 } },
  solid: { decel: 700, solid: true },
  void: { decel: 700, solid: true },
}

const SURFACE_BY_CHAR: Record<string, SurfaceId> = {
  '.': 'grass',
  ',': 'rough',
  ':': 'stone',
  s: 'sand',
  m: 'mud',
  i: 'ice',
  '~': 'water',
  b: 'wood',
  t: 'tunnel',
  '>': 'conveyorE',
  '<': 'conveyorW',
  '^': 'conveyorN',
  v: 'conveyorS',
  '#': 'solid',
  T: 'grass',
  H: 'grass',
}

export const TILE_LEGEND: Record<string, string> = {
  '.': 'grass',
  ',': 'rough grass',
  ':': 'smooth stone',
  s: 'sand',
  m: 'mud',
  i: 'ice',
  '~': 'water hazard',
  b: 'wooden bridge',
  t: 'stone tunnel',
  '>': 'conveyor (east)',
  '<': 'conveyor (west)',
  '^': 'conveyor (north)',
  v: 'conveyor (south)',
  '#': 'wall / hedge',
  T: 'tee',
  H: 'hole',
}

export function surfaceFromChar(char: string): SurfaceId {
  return SURFACE_BY_CHAR[char] ?? 'solid'
}

export function buildStaticWorld(hole: HoleDefinition): StaticWorld {
  const chars = hole.grid.map((row) => row.split(''))
  const surfaces: SurfaceId[][] = []
  const water = new Uint8Array(GRID_COLS * GRID_ROWS)
  const solids: Rect[] = []
  let tee: Vec = { x: 3 * CELL + CELL / 2, y: (GRID_ROWS / 2) * CELL + CELL / 2 }
  let cup: Vec = { x: (GRID_COLS - 4) * CELL + CELL / 2, y: (GRID_ROWS / 2) * CELL + CELL / 2 }

  for (let row = 0; row < GRID_ROWS; row += 1) {
    const charsRow = chars[row] ?? []
    const surfaceRow: SurfaceId[] = []
    for (let col = 0; col < GRID_COLS; col += 1) {
      const char = charsRow[col] ?? '#'
      const surface = surfaceFromChar(char)
      surfaceRow.push(surface)
      if (surface === 'water') water[row * GRID_COLS + col] = 1
      if (char === 'T') tee = { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 }
      if (char === 'H') cup = { x: col * CELL + CELL / 2, y: row * CELL + CELL / 2 }
    }
    surfaces.push(surfaceRow)
  }

  // Merge solid tiles into horizontal runs — fewer, cheaper colliders.
  for (let row = 0; row < GRID_ROWS; row += 1) {
    let start = -1
    for (let col = 0; col <= GRID_COLS; col += 1) {
      const solid = col < GRID_COLS && surfaces[row][col] === 'solid'
      if (solid && start < 0) start = col
      if (!solid && start >= 0) {
        solids.push({ x: start * CELL, y: row * CELL, w: (col - start) * CELL, h: CELL })
        start = -1
      }
    }
  }

  const segments: CapsuleCollider[] = (hole.walls ?? []).map((wall) => ({
    ax: wall.x1 * CELL,
    ay: wall.y1 * CELL,
    bx: wall.x2 * CELL,
    by: wall.y2 * CELL,
    r: (wall.width ?? 0.28) * CELL,
  }))

  const bumpers: CircleCollider[] = []
  for (const obstacle of hole.obstacles ?? []) {
    if (obstacle.type === 'bumper') {
      bumpers.push({ x: obstacle.x * CELL, y: obstacle.y * CELL, r: obstacle.radius * CELL })
    }
  }

  return { hole, surfaces, chars, solids, segments, bumpers, water, tee, cup }
}

export function surfaceAt(world: StaticWorld, x: number, y: number): SurfaceId {
  const col = clamp(Math.floor(x / CELL), 0, GRID_COLS - 1)
  const row = clamp(Math.floor(y / CELL), 0, GRID_ROWS - 1)
  return world.surfaces[row][col]
}

export function isWaterAt(world: StaticWorld, x: number, y: number): boolean {
  const col = clamp(Math.floor(x / CELL), 0, GRID_COLS - 1)
  const row = clamp(Math.floor(y / CELL), 0, GRID_ROWS - 1)
  return world.water[row * GRID_COLS + col] === 1
}

export function isSolidAt(world: StaticWorld, x: number, y: number): boolean {
  return surfaceAt(world, x, y) === 'solid'
}

// ---------------------------------------------------------------------------
// Collision helpers
// ---------------------------------------------------------------------------

interface ContactInfo {
  nx: number
  ny: number
  push: number
  /** Speed of the surface at the contact point (moving obstacles). */
  svx: number
  svy: number
  restitution: number
  kind: 'wall' | 'bumper'
}

function contactWithRect(ball: BallState, rect: Rect, svx = 0, svy = 0): ContactInfo | null {
  const cx = clamp(ball.x, rect.x, rect.x + rect.w)
  const cy = clamp(ball.y, rect.y, rect.y + rect.h)
  let dx = ball.x - cx
  let dy = ball.y - cy
  let dist = Math.hypot(dx, dy)
  if (dist > BALL_R) return null

  if (dist < 1e-4) {
    // Centre inside the box: escape along the shallowest axis.
    const left = ball.x - rect.x
    const right = rect.x + rect.w - ball.x
    const top = ball.y - rect.y
    const bottom = rect.y + rect.h - ball.y
    const min = Math.min(left, right, top, bottom)
    if (min === left) return { nx: -1, ny: 0, push: BALL_R + left, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
    if (min === right) return { nx: 1, ny: 0, push: BALL_R + right, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
    if (min === top) return { nx: 0, ny: -1, push: BALL_R + top, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
    return { nx: 0, ny: 1, push: BALL_R + bottom, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
  }

  dx /= dist
  dy /= dist
  return { nx: dx, ny: dy, push: BALL_R - dist, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
}

function contactWithCapsule(ball: BallState, capsule: CapsuleCollider, svx = 0, svy = 0): ContactInfo | null {
  const hit = closestOnSegment(ball.x, ball.y, capsule.ax, capsule.ay, capsule.bx, capsule.by)
  const reach = BALL_R + capsule.r
  if (hit.dist > reach) return null

  let nx = ball.x - hit.x
  let ny = ball.y - hit.y
  if (hit.dist < 1e-4) {
    const dx = capsule.bx - capsule.ax
    const dy = capsule.by - capsule.ay
    const l = Math.hypot(dx, dy) || 1
    nx = -dy / l
    ny = dx / l
    return { nx, ny, push: reach, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
  }
  nx /= hit.dist
  ny /= hit.dist
  return { nx, ny, push: reach - hit.dist, svx, svy, restitution: WALL_RESTITUTION, kind: 'wall' }
}

function contactWithCircle(
  ball: BallState,
  circle: CircleCollider,
  restitution: number,
  kind: 'wall' | 'bumper',
  svx = 0,
  svy = 0,
): ContactInfo | null {
  const dx = ball.x - circle.x
  const dy = ball.y - circle.y
  const dist = Math.hypot(dx, dy)
  const reach = BALL_R + circle.r
  if (dist > reach) return null
  if (dist < 1e-4) return { nx: 1, ny: 0, push: reach, svx, svy, restitution, kind }
  return { nx: dx / dist, ny: dy / dist, push: reach - dist, svx, svy, restitution, kind }
}

function applyContact(ball: BallState, contact: ContactInfo): number {
  ball.x += contact.nx * contact.push
  ball.y += contact.ny * contact.push

  const rvx = ball.vx - contact.svx
  const rvy = ball.vy - contact.svy
  const vn = rvx * contact.nx + rvy * contact.ny
  if (vn >= 0) return 0

  const impact = -vn
  const restitution = impact > MIN_BOUNCE_SPEED ? contact.restitution : 0

  let nextVx = rvx - (1 + restitution) * vn * contact.nx
  let nextVy = rvy - (1 + restitution) * vn * contact.ny

  // Gentle tangential scrape so shots lose a little energy along the wall.
  const tnx = nextVx * contact.nx + nextVy * contact.ny
  const tvx = nextVx - tnx * contact.nx
  const tvy = nextVy - tnx * contact.ny
  nextVx -= tvx * (1 - WALL_TANGENT_KEEP)
  nextVy -= tvy * (1 - WALL_TANGENT_KEEP)

  // A bumper should never feel dead: guarantee a lively kick, then cap it.
  if (contact.kind === 'bumper') {
    const outSpeed = Math.hypot(nextVx, nextVy)
    if (outSpeed < 210) {
      const dirX = nextVx || contact.nx
      const dirY = nextVy || contact.ny
      const dirLen = Math.hypot(dirX, dirY) || 1
      nextVx = (dirX / dirLen) * 210
      nextVy = (dirY / dirLen) * 210
    }
  }

  ball.vx = clampSpeed(nextVx + contact.svx)
  ball.vy = clampSpeed(nextVy + contact.svy)
  return impact
}

function clampSpeed(v: number): number {
  return clamp(v, -MAX_BALL_SPEED, MAX_BALL_SPEED)
}

export interface StaticHit {
  impact: number
  x: number
  y: number
  kind: 'wall' | 'bumper'
}

/** Resolve the ball against static geometry. Returns the biggest hit, if any. */
export function resolveStatics(world: StaticWorld, ball: BallState): StaticHit | null {
  let best: StaticHit | null = null

  for (let pass = 0; pass < 2; pass += 1) {
    for (const rect of world.solids) {
      // Cheap broadphase: most of the board is nowhere near the ball.
      if (
        ball.x + BALL_R < rect.x ||
        ball.x - BALL_R > rect.x + rect.w ||
        ball.y + BALL_R < rect.y ||
        ball.y - BALL_R > rect.y + rect.h
      ) {
        continue
      }
      const contact = contactWithRect(ball, rect)
      if (!contact) continue
      const impact = applyContact(ball, contact)
      if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'wall' }
    }
    for (const segment of world.segments) {
      const contact = contactWithCapsule(ball, segment)
      if (!contact) continue
      const impact = applyContact(ball, contact)
      if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'wall' }
    }
    for (const bumper of world.bumpers) {
      const contact = contactWithCircle(ball, bumper, BUMPER_RESTITUTION, 'bumper')
      if (!contact) continue
      const impact = applyContact(ball, contact)
      if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'bumper' }
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Moving obstacles: pure functions of time
// ---------------------------------------------------------------------------

interface DynRect {
  rect: Rect
  vx: number
  vy: number
  kind: 'gate' | 'platform' | 'log'
  carry: boolean
}

interface DynCapsule {
  capsule: CapsuleCollider
  vax: number
  vay: number
  vbx: number
  vby: number
  kind: 'blade' | 'spinlog'
}

interface DynCircle {
  circle: CircleCollider
  vx: number
  vy: number
  kind: 'bee' | 'fountain' | 'lily'
}

interface Shapes {
  rects: DynRect[]
  capsules: DynCapsule[]
  circles: DynCircle[]
  /** Lily pads are dry ground over water, not obstacles. */
  pads: DynCircle[]
  /** Moving platforms are rafts: dry ground that carries the ball. */
  rafts: DynRect[]
}

const EMPTY_SHAPES: Shapes = { rects: [], capsules: [], circles: [], pads: [], rafts: [] }

/** Smooth ping-pong 0..1 plus its time derivative. */
function oscillate(time: number, period: number, phase = 0): { s: number; ds: number } {
  const p = Math.max(0.2, period)
  const angle = (time / p + phase) * Math.PI * 2
  return { s: 0.5 - 0.5 * Math.cos(angle), ds: (Math.PI / p) * Math.sin(angle) }
}

export function obstacleShapes(obstacles: readonly Obstacle[], time: number): Shapes {
  if (!obstacles.length) return EMPTY_SHAPES
  const shapes: Shapes = { rects: [], capsules: [], circles: [], pads: [], rafts: [] }

  for (const obstacle of obstacles) {
    switch (obstacle.type) {
      case 'windmill': {
        const blades = obstacle.blades ?? 2
        const radius = obstacle.radius * CELL
        const omega = obstacle.speed
        const hubX = obstacle.x * CELL
        const hubY = obstacle.y * CELL
        for (let i = 0; i < blades; i += 1) {
          const angle = (obstacle.phase ?? 0) + time * omega + (i * Math.PI * 2) / blades
          const bx = hubX + Math.cos(angle) * radius
          const by = hubY + Math.sin(angle) * radius
          // Blade tips sweep with v = omega x r.
          shapes.capsules.push({
            capsule: { ax: hubX, ay: hubY, bx, by, r: 6 },
            vax: -omega * (hubY - hubY),
            vay: omega * (hubX - hubX),
            vbx: -omega * (by - hubY),
            vby: omega * (bx - hubX),
            kind: 'blade',
          })
        }
        break
      }
      case 'gate': {
        const { s, ds } = oscillate(time, obstacle.period, obstacle.phase)
        const axis = obstacle.axis ?? 'x'
        const offset = obstacle.travel * CELL * s
        const speed = obstacle.travel * CELL * ds
        const cx = obstacle.x * CELL + (axis === 'x' ? offset : 0)
        const cy = obstacle.y * CELL + (axis === 'y' ? offset : 0)
        const w = obstacle.w * CELL
        const h = obstacle.h * CELL
        shapes.rects.push({
          rect: { x: cx - w / 2, y: cy - h / 2, w, h },
          vx: axis === 'x' ? speed : 0,
          vy: axis === 'y' ? speed : 0,
          kind: 'gate',
          carry: false,
        })
        break
      }
      case 'platform':
      case 'log': {
        const { s, ds } = oscillate(time, obstacle.period, obstacle.phase)
        const cx = obstacle.x * CELL + obstacle.dx * CELL * s
        const cy = obstacle.y * CELL + obstacle.dy * CELL * s
        const w = obstacle.w * CELL
        const h = obstacle.h * CELL
        const entry: DynRect = {
          rect: { x: cx - w / 2, y: cy - h / 2, w, h },
          vx: obstacle.dx * CELL * ds,
          vy: obstacle.dy * CELL * ds,
          kind: obstacle.type === 'platform' ? 'platform' : 'log',
          carry: obstacle.type === 'platform',
        }
        if (obstacle.type === 'platform') shapes.rafts.push(entry)
        else shapes.rects.push(entry)
        break
      }
      case 'spinlog': {
        const omega = obstacle.speed
        const angle = (obstacle.phase ?? 0) + time * omega
        const half = (obstacle.length * CELL) / 2
        const cx = obstacle.x * CELL
        const cy = obstacle.y * CELL
        const dx = Math.cos(angle) * half
        const dy = Math.sin(angle) * half
        shapes.capsules.push({
          capsule: { ax: cx - dx, ay: cy - dy, bx: cx + dx, by: cy + dy, r: 7 },
          vax: omega * dy,
          vay: -omega * dx,
          vbx: -omega * dy,
          vby: omega * dx,
          kind: 'spinlog',
        })
        break
      }
      case 'bee': {
        const { s, ds } = oscillate(time, obstacle.period, obstacle.phase)
        const cx = obstacle.x * CELL + obstacle.dx * CELL * s
        const cy = obstacle.y * CELL + obstacle.dy * CELL * s
        shapes.circles.push({
          circle: { x: cx, y: cy, r: (obstacle.radius ?? 0.22) * CELL },
          vx: obstacle.dx * CELL * ds,
          vy: obstacle.dy * CELL * ds,
          kind: 'bee',
        })
        break
      }
      case 'fountain': {
        const period = Math.max(0.5, obstacle.period)
        const phase = ((time / period + (obstacle.phase ?? 0)) % 1 + 1) % 1
        // off for the first 45% of the cycle, then a swelling jet
        if (phase < 0.45) break
        const t = (phase - 0.45) / 0.55
        const r = obstacle.radius * CELL * (0.55 + 0.45 * Math.sin(t * Math.PI))
        shapes.circles.push({ circle: { x: obstacle.x * CELL, y: obstacle.y * CELL, r }, vx: 0, vy: 0, kind: 'fountain' })
        break
      }
      case 'lily': {
        const { s, ds } = oscillate(time, obstacle.period, obstacle.phase)
        shapes.pads.push({
          circle: {
            x: obstacle.x * CELL + obstacle.dx * CELL * s,
            y: obstacle.y * CELL + obstacle.dy * CELL * s,
            r: obstacle.radius * CELL,
          },
          vx: obstacle.dx * CELL * ds,
          vy: obstacle.dy * CELL * ds,
          kind: 'lily',
        })
        break
      }
      default:
        break
    }
  }

  return shapes
}

function resolveDynamics(shapes: Shapes, ball: BallState, dt: number): StaticHit | null {
  let best: StaticHit | null = null

  for (const entry of shapes.rects) {
    const contact = contactWithRect(ball, entry.rect, entry.vx, entry.vy)
    if (!contact) continue
    const impact = applyContact(ball, contact)
    // Riding a platform: match its velocity so the ball is carried along.
    if (entry.carry && contact.ny < -0.5 && impact < 90) {
      ball.vx += (entry.vx - ball.vx) * 0.55
      ball.vy += (entry.vy - ball.vy) * 0.55
    }
    if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'wall' }
  }

  for (const entry of shapes.capsules) {
    const hit = closestOnSegment(ball.x, ball.y, entry.capsule.ax, entry.capsule.ay, entry.capsule.bx, entry.capsule.by)
    const svx = entry.vax + (entry.vbx - entry.vax) * hit.t
    const svy = entry.vay + (entry.vby - entry.vay) * hit.t
    const contact = contactWithCapsule(ball, entry.capsule, svx, svy)
    if (!contact) continue
    const impact = applyContact(ball, contact)
    if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'wall' }
  }

  for (const entry of shapes.circles) {
    if (entry.kind === 'lily') continue
    if (entry.kind === 'bee') {
      const dx = ball.x - entry.circle.x
      const dy = ball.y - entry.circle.y
      const dist = Math.hypot(dx, dy)
      const reach = BALL_R + entry.circle.r
      if (dist > reach) continue
      const nx = dist < 1e-4 ? 1 : dx / dist
      const ny = dist < 1e-4 ? 0 : dy / dist
      ball.x += nx * (reach - dist)
      ball.y += ny * (reach - dist)
      const speed = Math.hypot(ball.vx, ball.vy)
      const kick = Math.min(240, 90 + speed * 0.15)
      ball.vx += nx * kick
      ball.vy += ny * kick
      best = { impact: Math.max(kick, 60), x: ball.x, y: ball.y, kind: 'wall' }
      continue
    }

    // Fountain jets are solid, gently moving discs.
    const speed = Math.hypot(entry.vx, entry.vy)
    const contact = contactWithCircle(ball, entry.circle, 0.35, 'wall', entry.vx, entry.vy)
    if (!contact) continue
    const impact = applyContact(ball, contact)
    if (impact > (best?.impact ?? 0)) best = { impact, x: ball.x, y: ball.y, kind: 'wall' }
    if (speed > 0 && impact < 60) {
      ball.vx += entry.vx * dt * 6
      ball.vy += entry.vy * dt * 6
    }
  }

  return best
}

// ---------------------------------------------------------------------------
// Free-shot simulation (preview line and course validation)
// ---------------------------------------------------------------------------

export interface SimResult {
  x: number
  y: number
  vx: number
  vy: number
  sunk: boolean
  wet: boolean
  stopped: boolean
  time: number
  wallHits: number
  path: Vec[]
}

export interface SimOptions {
  maxTime?: number
  samplePath?: boolean
  sampleEvery?: number
  stopOnWallBounce?: number
  maxPath?: number
}

export function simulateShot(world: StaticWorld, start: Vec, vx: number, vy: number, options: SimOptions = {}): SimResult {
  const ball: BallState = { x: start.x, y: start.y, vx, vy }
  const maxTime = options.maxTime ?? 5
  const sampleEvery = options.sampleEvery ?? 0.05
  const maxPath = options.maxPath ?? 80
  const path: Vec[] = options.samplePath ? [{ x: ball.x, y: ball.y }] : []
  let wallHits = 0
  let sampleTimer = 0
  let time = 0
  let sunk = false
  let wet = false
  let stopped = false
  const bounceLimit = options.stopOnWallBounce ?? Infinity

  while (time < maxTime) {
    const surface = SURFACES[surfaceAt(world, ball.x, ball.y)]
    applyFriction(ball, surface, FIXED_DT)

    const speed = Math.hypot(ball.vx, ball.vy)
    if (speed < STOP_SPEED) {
      stopped = true
      break
    }
    const steps = clamp(Math.ceil((speed * FIXED_DT) / (BALL_R * 0.55)), 1, 10)
    const sdt = FIXED_DT / steps

    for (let i = 0; i < steps; i += 1) {
      ball.x += ball.vx * sdt
      ball.y += ball.vy * sdt
      const hit = resolveStatics(world, ball)
      if (hit && hit.impact > MIN_BOUNCE_SPEED) {
        wallHits += 1
        if (wallHits > bounceLimit) {
          stopped = true
          break
        }
      }
      const dx = ball.x - world.cup.x
      const dy = ball.y - world.cup.y
      if (dx * dx + dy * dy < (HOLE_R - BALL_R * 0.35) ** 2 && Math.hypot(ball.vx, ball.vy) < CAPTURE_SPEED) {
        sunk = true
        break
      }
    }
    if (sunk) break
    if (isWaterAt(world, ball.x, ball.y)) {
      wet = true
      break
    }

    time += FIXED_DT
    sampleTimer += FIXED_DT
    if (options.samplePath && sampleTimer >= sampleEvery && path.length < maxPath) {
      sampleTimer = 0
      path.push({ x: ball.x, y: ball.y })
    }
    if (ball.x < -40 || ball.y < -40 || ball.x > GRID_COLS * CELL + 40 || ball.y > GRID_ROWS * CELL + 40) break
  }

  if (options.samplePath) path.push({ x: ball.x, y: ball.y })
  return { x: ball.x, y: ball.y, vx: ball.vx, vy: ball.vy, sunk, wet, stopped: stopped || time >= maxTime, time, wallHits, path }
}

function applyFriction(ball: BallState, surface: SurfaceInfo, dt: number): void {
  const speed = Math.hypot(ball.vx, ball.vy)
  if (speed > 0) {
    const drop = surface.decel * dt
    const next = Math.max(0, speed - drop)
    const scale = next / speed
    ball.vx *= scale
    ball.vy *= scale
  }
  if (surface.push) {
    ball.vx += surface.push.x * dt
    ball.vy += surface.push.y * dt
  }
}

// ---------------------------------------------------------------------------
// The playable world
// ---------------------------------------------------------------------------

export type WorldState = 'ready' | 'rolling' | 'sunk' | 'hazard'

export class World {
  readonly static: StaticWorld
  readonly hole: HoleDefinition
  ball: BallState
  state: WorldState = 'ready'
  time = 0
  strokes = 0
  lastLie: Vec
  events: WorldEvent[] = []
  wallHits = 0
  bumperHits = 0
  sandTouches = 0
  waterHits = 0
  teleports = 0
  private accumulator = 0
  private hazardTimer = 0
  private cooldowns: number[] = []
  private restingTime = 0

  constructor(hole: HoleDefinition) {
    this.hole = hole
    this.static = buildStaticWorld(hole)
    this.ball = { x: this.static.tee.x, y: this.static.tee.y, vx: 0, vy: 0 }
    this.lastLie = { ...this.static.tee }
    this.cooldowns = new Array(hole.obstacles?.length ?? 0).fill(-10)
  }

  get cup(): Vec {
    return this.static.cup
  }

  get tee(): Vec {
    return this.static.tee
  }

  get moving(): boolean {
    return this.state === 'rolling'
  }

  restart(): void {
    this.ball = { x: this.static.tee.x, y: this.static.tee.y, vx: 0, vy: 0 }
    this.lastLie = { ...this.static.tee }
    this.state = 'ready'
    this.time = 0
    this.strokes = 0
    this.events = []
    this.accumulator = 0
    this.hazardTimer = 0
    this.restingTime = 0
    this.wallHits = 0
    this.bumperHits = 0
    this.sandTouches = 0
    this.waterHits = 0
    this.teleports = 0
    this.cooldowns = new Array(this.hole.obstacles?.length ?? 0).fill(-10)
  }

  /** Reload the ball at a position without touching the stroke count. */
  placeAt(position: Vec): void {
    this.ball.x = position.x
    this.ball.y = position.y
    this.ball.vx = 0
    this.ball.vy = 0
    this.state = 'ready'
    this.hazardTimer = 0
  }

  canShoot(): boolean {
    return this.state === 'ready'
  }

  shoot(vx: number, vy: number): boolean {
    if (!this.canShoot()) return false
    const speed = Math.hypot(vx, vy)
    if (speed < 1) return false
    const scale = Math.min(speed, MAX_BALL_SPEED) / speed
    this.ball.vx = vx * scale
    this.ball.vy = vy * scale
    this.lastLie = { x: this.ball.x, y: this.ball.y }
    this.strokes += 1
    this.state = 'rolling'
    this.restingTime = 0
    return true
  }

  drainEvents(): WorldEvent[] {
    if (!this.events.length) return []
    const events = this.events
    this.events = []
    return events
  }

  update(frameDt: number): void {
    const dt = Math.min(frameDt, 0.25)
    this.accumulator += dt
    let steps = 0
    while (this.accumulator >= FIXED_DT && steps < MAX_FRAME_STEPS) {
      this.step(FIXED_DT)
      this.accumulator -= FIXED_DT
      steps += 1
    }
    if (steps >= MAX_FRAME_STEPS) this.accumulator = 0
  }

  private emit(kind: WorldEventKind, strength?: number): void {
    this.events.push({ kind, x: this.ball.x, y: this.ball.y, strength })
  }

  step(dt: number): void {
    this.time += dt

    if (this.state === 'sunk') return
    if (this.state === 'hazard') {
      this.hazardTimer -= dt
      if (this.hazardTimer <= 0) {
        this.ball.x = this.lastLie.x
        this.ball.y = this.lastLie.y
        this.ball.vx = 0
        this.ball.vy = 0
        this.state = 'ready'
      }
      return
    }
    if (this.state !== 'rolling') return

    const ball = this.ball
    const surface = SURFACES[surfaceAt(this.static, ball.x, ball.y)]
    if (surface === SURFACES.sand) this.sandTouches += 1
    applyFriction(ball, surface, dt)
    this.applyZones(dt)

    const speed = Math.hypot(ball.vx, ball.vy)
    if (speed < STOP_SPEED) {
      this.settle()
      return
    }

    // Pull toward the cup once the ball is close and slow enough to care.
    const toCupX = this.static.cup.x - ball.x
    const toCupY = this.static.cup.y - ball.y
    const cupDist = Math.hypot(toCupX, toCupY)
    if (cupDist < CUP_GRAVITY_RADIUS && cupDist > 0.5 && speed < 460) {
      const pull = (CUP_GRAVITY * (1 - cupDist / CUP_GRAVITY_RADIUS) * dt) / cupDist
      ball.vx += toCupX * pull
      ball.vy += toCupY * pull
    }

    const substeps = clamp(Math.ceil((speed * dt) / (BALL_R * 0.55)), 1, 12)
    const sdt = dt / substeps

    for (let i = 0; i < substeps; i += 1) {
      ball.x += ball.vx * sdt
      ball.y += ball.vy * sdt

      const staticHit = resolveStatics(this.static, ball)
      if (staticHit && staticHit.impact > 45) {
        if (staticHit.kind === 'bumper') {
          this.bumperHits += 1
          this.emit('bumper', staticHit.impact)
        } else {
          this.wallHits += 1
          this.emit('wall', staticHit.impact)
        }
      }

      const shapes = obstacleShapes(this.hole.obstacles ?? [], this.time + i * sdt)
      this.carryRafts(shapes, sdt)
      const dynamicHit = resolveDynamics(shapes, ball, sdt)
      if (dynamicHit && dynamicHit.impact > 45) {
        this.emit('wall', dynamicHit.impact)
      }
      resolveStatics(this.static, ball)

      if (this.tryCapture()) return
      if (this.checkWater(shapes)) return
    }

    this.applyTriggers(dt)

    const endSpeed = Math.hypot(ball.vx, ball.vy)
    if (endSpeed < STOP_SPEED) {
      this.settle()
    } else if (endSpeed < 40) {
      this.restingTime += dt
      if (this.restingTime > 0.35) this.settle()
    } else {
      this.restingTime = 0
    }
  }

  private settle(): void {
    this.ball.vx = 0
    this.ball.vy = 0
    this.lastLie = { x: this.ball.x, y: this.ball.y }
    this.state = 'ready'
    this.emit('stop')
  }

  private applyZones(dt: number): void {
    for (const obstacle of this.hole.obstacles ?? []) {
      if (obstacle.type === 'wind' || obstacle.type === 'slope') {
        const halfW = (obstacle.w * CELL) / 2
        const halfH = (obstacle.h * CELL) / 2
        const cx = obstacle.x * CELL
        const cy = obstacle.y * CELL
        if (
          this.ball.x > cx - halfW &&
          this.ball.x < cx + halfW &&
          this.ball.y > cy - halfH &&
          this.ball.y < cy + halfH
        ) {
          this.ball.vx += obstacle.ax * dt
          this.ball.vy += obstacle.ay * dt
        }
      }
    }
  }

  private applyTriggers(dt: number): void {
    const obstacles = this.hole.obstacles ?? []
    for (let i = 0; i < obstacles.length; i += 1) {
      const obstacle = obstacles[i]
      const cd = this.cooldowns[i] ?? -10
      if (this.time - cd < 0.6) continue
      const bx = this.ball.x
      const by = this.ball.y

      if (obstacle.type === 'teleporter') {
        const radius = (obstacle.radius ?? 0.42) * CELL
        if (Math.hypot(bx - obstacle.x * CELL, by - obstacle.y * CELL) < radius) {
          this.ball.x = obstacle.tx * CELL
          this.ball.y = obstacle.ty * CELL
          this.cooldowns[i] = this.time
          this.teleports += 1
          this.emit('teleport')
        }
      } else if (obstacle.type === 'spring') {
        const radius = (obstacle.radius ?? 0.36) * CELL
        if (Math.hypot(bx - obstacle.x * CELL, by - obstacle.y * CELL) < radius) {
          const angle = (obstacle.angle * Math.PI) / 180
          this.ball.vx = Math.cos(angle) * obstacle.power
          this.ball.vy = Math.sin(angle) * obstacle.power
          this.cooldowns[i] = this.time
          this.emit('spring')
        }
      } else if (obstacle.type === 'fountain') {
        const radius = obstacle.radius * CELL
        const distance = Math.hypot(bx - obstacle.x * CELL, by - obstacle.y * CELL)
        const period = Math.max(0.5, obstacle.period)
        const phase = (((this.time / period + (obstacle.phase ?? 0)) % 1) + 1) % 1
        if (distance < radius && phase > 0.45 && phase < 0.75 && distance > 1) {
          const power = 260 * (1 - distance / radius)
          this.ball.vx += ((bx - obstacle.x * CELL) / distance) * power * dt * 10
          this.ball.vy += ((by - obstacle.y * CELL) / distance) * power * dt * 10
          this.emit('fountain', power)
        }
      }
    }
  }

  private tryCapture(): boolean {
    const dx = this.ball.x - this.static.cup.x
    const dy = this.ball.y - this.static.cup.y
    const dist = Math.hypot(dx, dy)
    const speed = Math.hypot(this.ball.vx, this.ball.vy)
    if (dist < HOLE_R - BALL_R * 0.35 && speed < CAPTURE_SPEED) {
      this.ball.x = this.static.cup.x
      this.ball.y = this.static.cup.y
      this.ball.vx = 0
      this.ball.vy = 0
      this.state = 'sunk'
      this.emit('sink')
      return true
    }
    // Fast ball clipping the rim: a small deflection sells the lip-out.
    if (dist < HOLE_R + BALL_R && dist > 1 && speed >= CAPTURE_SPEED) {
      const nx = dx / dist
      const ny = dy / dist
      this.ball.vx += nx * 22
      this.ball.vy += ny * 22
    }
    return false
  }

  /**
   * Rafts and pads are dry footing: a ball resting on one is carried with it.
   * A ball that is still travelling keeps its own momentum so a shot can roll
   * clean across a moving platform.
   */
  private carryRafts(shapes: Shapes, dt: number): void {
    if (Math.hypot(this.ball.vx, this.ball.vy) > 80) return
    for (const raft of shapes.rafts) {
      if (
        this.ball.x > raft.rect.x &&
        this.ball.x < raft.rect.x + raft.rect.w &&
        this.ball.y > raft.rect.y &&
        this.ball.y < raft.rect.y + raft.rect.h
      ) {
        this.ball.x += raft.vx * dt
        this.ball.y += raft.vy * dt
        this.ball.vx = raft.vx
        this.ball.vy = raft.vy
        return
      }
    }
    for (const pad of shapes.pads) {
      const dx = this.ball.x - pad.circle.x
      const dy = this.ball.y - pad.circle.y
      if (dx * dx + dy * dy < (pad.circle.r - BALL_R * 0.2) ** 2) {
        this.ball.x += pad.vx * dt
        this.ball.y += pad.vy * dt
        this.ball.vx = pad.vx
        this.ball.vy = pad.vy
        return
      }
    }
  }

  private checkWater(shapes: Shapes): boolean {
    if (!isWaterAt(this.static, this.ball.x, this.ball.y)) return false
    // Dry footing over water: a lily pad or a moving raft.
    for (const pad of shapes.pads) {
      const dx = this.ball.x - pad.circle.x
      const dy = this.ball.y - pad.circle.y
      if (dx * dx + dy * dy < (pad.circle.r - BALL_R * 0.2) ** 2) return false
    }
    for (const raft of shapes.rafts) {
      if (
        this.ball.x > raft.rect.x + 2 &&
        this.ball.x < raft.rect.x + raft.rect.w - 2 &&
        this.ball.y > raft.rect.y + 2 &&
        this.ball.y < raft.rect.y + raft.rect.h - 2
      ) {
        return false
      }
    }
    this.waterHits += 1
    this.strokes += 1
    this.ball.vx = 0
    this.ball.vy = 0
    this.state = 'hazard'
    this.hazardTimer = 0.7
    this.emit('water')
    return true
  }

  /** Predicted path for the aiming assist: statics only, stops at the first wall. */
  predictPath(vx: number, vy: number, maxTime = 2.4): { points: Vec[]; hit: boolean } {
    const result = simulateShot(this.static, { x: this.ball.x, y: this.ball.y }, vx, vy, {
      maxTime,
      samplePath: true,
      sampleEvery: 0.035,
      stopOnWallBounce: 0,
      maxPath: 90,
    })
    return { points: result.path, hit: result.wallHits > 0 }
  }
}
