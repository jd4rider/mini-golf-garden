import { describe, expect, it } from 'vitest'
import { BALL_R, CELL, FIXED_DT } from '../src/core/constants'
import { hole } from '../src/core/courses/helpers'
import type { HoleDefinition } from '../src/core/types'
import { World, buildStaticWorld, simulateShot } from '../src/core/world'

function makeHole(rows: string[], extras: Partial<HoleDefinition> = {}): HoleDefinition {
  return hole({ name: 'Test hole', par: 3, grid: rows, ...extras })
}

const EMPTY = [
  '########################',
  '#.T....................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#......................#',
  '#...............H......#',
  '#......................#',
  '########################',
]

function run(world: World, seconds: number): void {
  const steps = Math.ceil(seconds / FIXED_DT)
  for (let i = 0; i < steps; i += 1) world.step(FIXED_DT)
}

describe('rolling and friction', () => {
  it('slows a putt to a full stop', () => {
    const world = new World(makeHole(EMPTY))
    world.shoot(600, 0)
    run(world, 5)
    expect(world.state).toBe('ready')
    expect(Math.hypot(world.ball.vx, world.ball.vy)).toBe(0)
    expect(world.ball.x).toBeGreaterThan(world.tee.x)
  })

  it('travels further on stone than on sand', () => {
    const rows = EMPTY.map((row) => row)
    rows[7] = '#.T..................H.#'
    const grass = buildStaticWorld(makeHole(rows))
    const stoneRows = rows.map((row, index) => (index >= 1 && index <= 14 ? row.replace(/\./g, ':') : row))
    stoneRows[7] = '#:T::::::::::::::::::H:#'
    const sandRows = rows.map((row, index) => (index >= 1 && index <= 14 ? row.replace(/\./g, 's') : row))
    sandRows[7] = '#sTssssssssssssssssssH s#'.slice(0, 24)

    const grassShot = simulateShot(grass, { x: 3.5 * CELL, y: 7.5 * CELL }, 600, 0, { maxTime: 6 })
    const stoneShot = simulateShot(buildStaticWorld(makeHole(stoneRows)), { x: 3.5 * CELL, y: 7.5 * CELL }, 600, 0, {
      maxTime: 6,
    })
    const sandShot = simulateShot(buildStaticWorld(makeHole(sandRows)), { x: 3.5 * CELL, y: 7.5 * CELL }, 600, 0, {
      maxTime: 6,
    })
    expect(stoneShot.x).toBeGreaterThan(grassShot.x)
    expect(sandShot.x).toBeLessThan(grassShot.x)
  })

  it('lets a conveyor push a rolling ball along', () => {
    const rows = EMPTY.map((row) => row)
    const beltRows = rows.map((row, index) => (index === 7 ? row.replace(/\./g, '>') : row))
    beltRows[7] = '#>T>>>>>>>>>>>>>>>>>>H>#'.slice(0, 24)
    const plain = buildStaticWorld(makeHole(rows))
    const belt = buildStaticWorld(makeHole(beltRows))
    const from = { x: 4.5 * CELL, y: 7.5 * CELL }
    const plainShot = simulateShot(plain, from, 260, 0, { maxTime: 6 })
    const beltShot = simulateShot(belt, from, 260, 0, { maxTime: 6 })
    expect(beltShot.x).toBeGreaterThan(plainShot.x)
  })
})

describe('collision safety', () => {
  it('never tunnels through a hedge at maximum speed', () => {
    const rows = EMPTY.map((row, index) => {
      if (index >= 1 && index <= 14) {
        const chars = row.split('')
        chars[11] = '#'
        return chars.join('')
      }
      return row
    })
    const world = new World(makeHole(rows))
    world.ball.x = 4 * CELL
    world.ball.y = 8 * CELL
    world.shoot(1450, 0)
    let deepest = world.ball.x
    for (let i = 0; i < 600; i += 1) {
      world.step(FIXED_DT)
      deepest = Math.max(deepest, world.ball.x)
    }
    expect(deepest).toBeLessThan(11 * CELL - BALL_R + 1)
  })

  it('settles in a corner without jitter', () => {
    const world = new World(makeHole(EMPTY))
    world.ball.x = 12 * CELL
    world.ball.y = 10 * CELL
    world.shoot(1200, 900)
    run(world, 8)
    expect(world.state).toBe('ready')
    expect(world.ball.vx).toBe(0)
    expect(world.ball.vy).toBe(0)
  })

  it('keeps the ball on the board under random fire', () => {
    const world = new World(makeHole(EMPTY))
    for (let i = 0; i < 12; i += 1) {
      const angle = (i / 12) * Math.PI * 2
      world.placeAt(world.tee)
      world.shoot(Math.cos(angle) * 1400, Math.sin(angle) * 1400)
      run(world, 3)
      expect(world.ball.x).toBeGreaterThan(0)
      expect(world.ball.x).toBeLessThan(24 * CELL)
      expect(world.ball.y).toBeGreaterThan(0)
      expect(world.ball.y).toBeLessThan(16 * CELL)
    }
  })
})

describe('the cup', () => {
  it('sinks a slow ball rolling across it', () => {
    const world = new World(makeHole(EMPTY))
    world.ball.x = world.cup.x - 8
    world.ball.y = world.cup.y
    world.shoot(160, 0)
    run(world, 2)
    expect(world.state).toBe('sunk')
  })

  it('lets a fast ball roll over the cup', () => {
    const world = new World(makeHole(EMPTY))
    world.ball.x = world.cup.x - 60
    world.ball.y = world.cup.y
    world.shoot(1300, 0)
    // Long enough to pass the cup, short enough not to bounce back off the wall.
    run(world, 0.12)
    expect(world.state).not.toBe('sunk')
    expect(world.ball.x).toBeGreaterThan(world.cup.x)
  })

  it('does not pull in a ball from across the green', () => {
    const world = new World(makeHole(EMPTY))
    world.ball.x = world.cup.x - 120
    world.ball.y = world.cup.y
    world.shoot(20, 0)
    run(world, 3)
    expect(world.state).not.toBe('sunk')
  })
})

describe('hazards and bumpers', () => {
  it('charges a penalty and replaces the ball after water', () => {
    const rows = EMPTY.map((row, index) => {
      if (index >= 1 && index <= 14) {
        const chars = row.split('')
        for (let col = 6; col <= 9; col += 1) chars[col] = '~'
        return chars.join('')
      }
      return row
    })
    const world = new World(makeHole(rows))
    world.shoot(700, 0)
    run(world, 1)
    const events = world.drainEvents()
    expect(events.some((event) => event.kind === 'water')).toBe(true)
    expect(world.strokes).toBe(2)
    run(world, 1)
    expect(world.ball.x).toBeCloseTo(world.tee.x, 0)
  })

  it('bounces off a bumper with some energy', () => {
    const world = new World(
      makeHole(EMPTY, { obstacles: [{ type: 'bumper', x: 12.5, y: 8.5, radius: 1 }] }),
    )
    world.ball.x = 10 * CELL
    world.ball.y = 8.5 * CELL
    world.shoot(600, 0)
    run(world, 0.6)
    expect(world.ball.vx).toBeLessThan(0)
    expect(world.bumperHits).toBeGreaterThan(0)
  })
})

describe('determinism and previews', () => {
  it('replays an identical shot identically', () => {
    const definition = makeHole(EMPTY, { obstacles: [{ type: 'bee', x: 10.5, y: 8.5, dx: 3, dy: 1, period: 3 }] })
    const a = new World(definition)
    const b = new World(definition)
    a.shoot(830, 240)
    b.shoot(830, 240)
    for (let i = 0; i < 700; i += 1) {
      a.step(FIXED_DT)
      b.step(FIXED_DT)
    }
    expect(b.ball.x).toBe(a.ball.x)
    expect(b.ball.y).toBe(a.ball.y)
    expect(b.state).toBe(a.state)
  })

  it('draws a preview that stops at a wall', () => {
    const rows = EMPTY.map((row, index) => {
      if (index >= 1 && index <= 14) {
        const chars = row.split('')
        chars[11] = '#'
        return chars.join('')
      }
      return row
    })
    const world = new World(makeHole(rows))
    const preview = world.predictPath(900, 0)
    expect(preview.hit).toBe(true)
    expect(preview.points.length).toBeGreaterThan(1)
    for (const point of preview.points) expect(point.x).toBeLessThan(11 * CELL)
  })
})
