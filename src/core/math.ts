/** Small deterministic helpers shared by the physics, courses and UI. */

export interface Vec {
  x: number
  y: number
}

export const clamp = (value: number, min: number, max: number): number =>
  value < min ? min : value > max ? max : value

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t

export const len = (x: number, y: number): number => Math.hypot(x, y)

export function normalize(x: number, y: number): Vec {
  const l = Math.hypot(x, y)
  return l < 1e-6 ? { x: 0, y: 0 } : { x: x / l, y: y / l }
}

/** Cheap deterministic 32-bit hash, used for daily seeds and decoration. */
export function hashString(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** Mulberry32 — small, fast, repeatable. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function pick<T>(list: readonly T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

/** Shortest signed difference between two angles, in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d < -Math.PI) d += Math.PI * 2
  return d
}

/** Distance from point p to segment ab, plus the closest point. */
export function closestOnSegment(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): { x: number; y: number; t: number; dist: number } {
  const dx = bx - ax
  const dy = by - ay
  const lengthSq = dx * dx + dy * dy
  const t = lengthSq < 1e-9 ? 0 : clamp(((px - ax) * dx + (py - ay) * dy) / lengthSq, 0, 1)
  const x = ax + dx * t
  const y = ay + dy * t
  return { x, y, t, dist: Math.hypot(px - x, py - y) }
}
