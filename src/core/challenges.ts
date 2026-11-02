import type { TrickShot } from './types'

/**
 * Trick shots reuse the hand-built holes but ask for a specific, often unusual,
 * finish. Each objective is measured from the physics event counters, so the
 * game can never award one by accident.
 */
export const TRICK_SHOTS: TrickShot[] = [
  {
    id: 'meadow-cushion',
    name: 'Cushion Shot',
    description: 'Bank off two walls, then sink it.',
    courseId: 'sunny-meadows',
    holeIndex: 7,
    objective: { kind: 'bounceWalls', count: 2 },
  },
  {
    id: 'grove-bounce',
    name: 'Mushroom Bounce',
    description: 'Hit the big mushroom and still make the putt.',
    courseId: 'mushroom-grove',
    holeIndex: 3,
    objective: { kind: 'hitBumper', count: 1 },
  },
  {
    id: 'pond-two',
    name: 'Two Clean Strokes',
    description: 'Cross the pond and finish in exactly two putts.',
    courseId: 'lily-pond',
    holeIndex: 4,
    objective: { kind: 'strokesExactly', count: 2 },
  },
  {
    id: 'crystal-portal',
    name: 'Portal Putt',
    description: 'Use the teleporting flower on the way to the cup.',
    courseId: 'crystal-garden',
    holeIndex: 5,
    objective: { kind: 'useTeleporter', count: 1 },
  },
  {
    id: 'orchard-clean',
    name: 'No Sand, No Problem',
    description: 'Finish the hole without touching a single bunker.',
    courseId: 'autumn-orchard',
    holeIndex: 2,
    objective: { kind: 'noSand' },
  },
  {
    id: 'royal-ace',
    name: 'Royal Ace',
    description: 'A hole in one on the palace approach.',
    courseId: 'royal-garden',
    holeIndex: 8,
    objective: { kind: 'holeInOne' },
  },
]

export function trickById(id: string): TrickShot | undefined {
  return TRICK_SHOTS.find((shot) => shot.id === id)
}

export interface TrickContext {
  strokes: number
  wallHits: number
  bumperHits: number
  sandTouches: number
  teleports: number
}

/** Did this finished hole satisfy the challenge? */
export function trickCompleted(shot: TrickShot, context: TrickContext): boolean {
  const { objective } = shot
  switch (objective.kind) {
    case 'bounceWalls':
      return context.wallHits >= (objective.count ?? 1)
    case 'hitBumper':
      return context.bumperHits >= (objective.count ?? 1)
    case 'useTeleporter':
      return context.teleports >= (objective.count ?? 1)
    case 'strokesExactly':
      return context.strokes === (objective.count ?? 1)
    case 'noSand':
      return context.sandTouches === 0
    case 'holeInOne':
      return context.strokes === 1
    default:
      return false
  }
}

export function trickProgressText(shot: TrickShot, context: TrickContext): string {
  switch (shot.objective.kind) {
    case 'bounceWalls':
      return `Walls hit: ${context.wallHits} / ${shot.objective.count ?? 1}`
    case 'hitBumper':
      return `Mushrooms hit: ${Math.min(context.bumperHits, shot.objective.count ?? 1)} / ${shot.objective.count ?? 1}`
    case 'useTeleporter':
      return context.teleports > 0 ? 'Flower used ✓' : 'Flower not used yet'
    case 'strokesExactly':
      return `Strokes: ${context.strokes} / ${shot.objective.count ?? 1}`
    case 'noSand':
      return context.sandTouches === 0 ? 'Still clean ✓' : 'Bunker touched ✗'
    case 'holeInOne':
      return 'One putt only'
    default:
      return ''
  }
}
