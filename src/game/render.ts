/**
 * Animated layer: obstacles, flags, ball and aiming indicators.
 * Everything here reads from the deterministic physics world and never mutates
 * it, so rendering can never change the outcome of a shot.
 */

import Phaser from 'phaser'
import { BALL_R, CELL, HOLE_R } from '../core/constants'
import { clamp } from '../core/math'
import type { HoleDefinition } from '../core/types'
import { obstacleShapes, type World } from '../core/world'
import { INK, type Theme } from './theme'

export interface RenderState {
  time: number
  /** Bounce squash for bumper mushrooms, keyed by obstacle index. */
  bumperPulse: Map<number, number>
  /** Ripple phase for fountains. */
  fountainPulse: number
}

function fillEllipse(g: Phaser.GameObjects.Graphics, x: number, y: number, rx: number, ry: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha)
  g.fillEllipse(x, y, rx * 2, ry * 2)
}

function hex(value: string): number {
  return Phaser.Display.Color.HexStringToColor(value).color
}

export function drawObstacles(
  g: Phaser.GameObjects.Graphics,
  hole: HoleDefinition,
  theme: Theme,
  time: number,
  pulse: Map<number, number>,
): void {
  const shapes = obstacleShapes(hole.obstacles ?? [], time)
  const accent = hex(theme.accent)
  const wood = hex(theme.wood)
  const dark = hex(theme.hedgeDark)
  const light = hex(theme.hedgeLight)
  const flowers = hex(theme.flower)

  // --- Tunnels are drawn under the ball, arches above it; keep it simple and
  // paint the arch here so it reads as a ruin the ball rolls through.
  for (const obstacle of hole.obstacles ?? []) {
    if (obstacle.type !== 'tunnel') continue
    const w = obstacle.w * CELL
    const h = obstacle.h * CELL
    const x = obstacle.x * CELL - w / 2
    const y = obstacle.y * CELL - h / 2
    g.fillStyle(dark, 0.24)
    g.fillRoundedRect(x + 4, y + 6, w, h, 10)
    g.fillStyle(hex(theme.stoneAlt), 0.95)
    g.fillRoundedRect(x, y, w, h, 10)
    g.fillStyle(dark, 0.35)
    g.fillRoundedRect(x + 6, y + h * 0.35, w - 12, h * 0.65, 8)
    g.lineStyle(2, hex(theme.stone), 0.9)
    g.strokeRoundedRect(x, y, w, h, 10)
  }

  // --- Static bumpers (mushrooms, hay bales, topiary balls).
  hole.obstacles?.forEach((obstacle, index) => {
    if (obstacle.type !== 'bumper') return
    const x = obstacle.x * CELL
    const y = obstacle.y * CELL
    const radius = obstacle.radius * CELL
    const squash = pulse.get(index) ?? 0
    const scale = 1 + squash * 0.18
    const squashY = 1 - squash * 0.12

    fillEllipse(g, x + 2, y + radius * 0.5, radius * 1.02, radius * 0.5, 0x000000, 0.22)

    if (theme.id === 'orchard') {
      // Hay bale: straw bands around a cylinder.
      g.fillStyle(0xd9b06a, 1)
      g.fillCircle(x, y, radius * scale)
      g.fillStyle(0xc2914f, 1)
      for (let i = -2; i <= 2; i += 1) {
        g.fillRect(x - radius, y + i * (radius * 0.32), radius * 2, 2)
      }
      g.lineStyle(2, 0x8c6532, 0.8)
      g.strokeCircle(x, y, radius * scale)
    } else if (theme.id === 'royal') {
      // Clipped topiary ball with a gold ring.
      g.fillStyle(hex(theme.hedge), 1)
      g.fillCircle(x, y, radius * scale)
      g.fillStyle(hex(theme.hedgeLight), 0.55)
      g.fillCircle(x - radius * 0.3, y - radius * 0.32, radius * 0.45)
      g.lineStyle(2, accent, 0.7)
      g.strokeCircle(x, y, radius + 1)
    } else {
      // Mushroom: cream stem, coloured cap with spots.
      g.fillStyle(0xf3e6cf, 1)
      g.fillEllipse(x, y + radius * 0.45, radius * 1.05, radius * 0.55)
      g.fillStyle(hex(theme.flowerAlt), 1)
      g.fillEllipse(x, y - radius * 0.1, radius * 2.05 * scale, radius * 1.55 * squashY)
      g.fillStyle(hex(theme.flower), 0.9)
      g.fillCircle(x - radius * 0.5, y - radius * 0.35, radius * 0.18)
      g.fillCircle(x + radius * 0.42, y - radius * 0.2, radius * 0.14)
      g.fillCircle(x + radius * 0.05, y - radius * 0.6, radius * 0.11)
      g.lineStyle(2, dark, 0.35)
      g.strokeEllipse(x, y - radius * 0.1, radius * 2.05 * scale, radius * 1.55 * squashY)
    }
  })

  // --- Windmills: stone tower plus sails.
  hole.obstacles?.forEach((obstacle) => {
    if (obstacle.type !== 'windmill') return
    const x = obstacle.x * CELL
    const y = obstacle.y * CELL
    const radius = obstacle.radius * CELL
    fillEllipse(g, x + 4, y + 10, radius * 0.5, radius * 0.32, 0x000000, 0.25)
    g.fillStyle(hex(theme.stoneAlt), 1)
    g.fillCircle(x, y, 13)
    g.lineStyle(2, hex(theme.stone), 1)
    g.strokeCircle(x, y, 13)
    g.fillStyle(accent, 1)
    g.fillCircle(x, y, 5)

    for (const capsule of shapes.capsules) {
      const near =
        Math.hypot(capsule.capsule.ax - x, capsule.capsule.ay - y) < 1 &&
        Math.hypot(capsule.capsule.bx - x, capsule.capsule.by - y) < radius + 4
      if (!near) continue
      const ax = capsule.capsule.ax
      const ay = capsule.capsule.ay
      const bx = capsule.capsule.bx
      const by = capsule.capsule.by
      // Sail: wooden spar plus a canvas panel.
      g.lineStyle(10, wood, 1)
      g.lineBetween(ax, ay, bx, by)
      g.lineStyle(1.5, 0x6b4a24, 0.7)
      g.lineBetween(ax, ay, bx, by)
      const nx = -(by - ay)
      const ny = bx - ax
      const len = Math.hypot(nx, ny) || 1
      const ox = (nx / len) * 13
      const oy = (ny / len) * 13
      g.fillStyle(hex(theme.flower), 0.9)
      g.fillTriangle(ax + ox * 0.4, ay + oy * 0.4, bx + ox, by + oy, bx, by)
      g.lineStyle(1.4, 0x8c6532, 0.8)
      g.strokeTriangle(ax + ox * 0.4, ay + oy * 0.4, bx + ox, by + oy, bx, by)
    }
  })

  // --- Gates, moving logs and platforms.
  for (const entry of shapes.rects) {
    const { x, y, w, h } = entry.rect
    if (entry.kind === 'log') {
      g.fillStyle(0x000000, 0.2)
      g.fillRoundedRect(x + 3, y + 4, w, h, h / 2)
      g.fillStyle(wood, 1)
      g.fillRoundedRect(x, y, w, h, h / 2)
      g.fillStyle(0x6b4a24, 0.5)
      for (let i = 0; i < 3; i += 1) {
        g.fillCircle(x + w * 0.25 + i * (w * 0.22), y + h * 0.5, h * 0.16)
      }
      g.lineStyle(2, 0x4d3418, 0.8)
      g.strokeRoundedRect(x, y, w, h, h / 2)
    } else {
      // Gate / moving hedge: iron frame with vertical bars.
      g.fillStyle(0x000000, 0.22)
      g.fillRoundedRect(x + 3, y + 4, w, h, 5)
      g.fillStyle(dark, 1)
      g.fillRoundedRect(x, y, w, h, 5)
      g.fillStyle(light, 0.5)
      g.fillRoundedRect(x + 2, y + 2, w - 4, h * 0.35, 4)
      g.lineStyle(2, accent, 0.75)
      g.strokeRoundedRect(x, y, w, h, 5)
      if (w > h) {
        for (let i = 1; i < 4; i += 1) g.lineBetween(x + (w / 4) * i, y + 3, x + (w / 4) * i, y + h - 3)
      } else {
        for (let i = 1; i < 4; i += 1) g.lineBetween(x + 3, y + (h / 4) * i, x + w - 3, y + (h / 4) * i)
      }
    }
  }

  // --- Rotating logs.
  for (const capsule of shapes.capsules) {
    if (capsule.kind !== 'spinlog') continue
    g.lineStyle(15, 0x000000, 0.18)
    g.lineBetween(capsule.capsule.ax + 2, capsule.capsule.ay + 4, capsule.capsule.bx + 2, capsule.capsule.by + 4)
    g.lineStyle(14, wood, 1)
    g.lineBetween(capsule.capsule.ax, capsule.capsule.ay, capsule.capsule.bx, capsule.capsule.by)
    g.lineStyle(2, 0x4d3418, 0.7)
    g.lineBetween(capsule.capsule.ax, capsule.capsule.ay, capsule.capsule.bx, capsule.capsule.by)
  }

  // --- Rafts (moving platforms): wooden deck with a rope rail.
  for (const raft of shapes.rafts) {
    const { x, y, w, h } = raft.rect
    g.fillStyle(0x000000, 0.22)
    g.fillRoundedRect(x + 3, y + 5, w, h, 8)
    g.fillStyle(wood, 1)
    g.fillRoundedRect(x, y, w, h, 8)
    g.fillStyle(0x8a6039, 0.5)
    for (let i = 0; i < 5; i += 1) g.fillRect(x + 4, y + (h / 5) * i + 2, w - 8, 1.4)
    g.lineStyle(2.5, 0xd9c39a, 0.9)
    g.strokeRoundedRect(x + 1, y + 1, w - 2, h - 2, 8)
    g.fillStyle(0x6b4a24, 0.6)
    for (let i = 0; i < 4; i += 1) g.fillCircle(x + 6 + i * ((w - 12) / 3), y + 4, 1.6)
  }

  // --- Lily pads.
  for (const pad of shapes.pads) {
    const { x, y, r } = pad.circle
    g.fillStyle(0x000000, 0.18)
    g.fillCircle(x + 2, y + 4, r)
    g.fillStyle(0x3f8a5a, 1)
    g.fillCircle(x, y, r)
    g.fillStyle(0x5fb578, 0.85)
    g.fillCircle(x - r * 0.25, y - r * 0.25, r * 0.55)
    g.fillStyle(0x2f6b48, 1)
    g.fillTriangle(x, y, x + r, y - 2, x + r * 0.72, y + 5)
    if (r > 26) {
      g.fillStyle(flowers, 0.95)
      for (let i = 0; i < 5; i += 1) {
        const angle = (i / 5) * Math.PI * 2
        g.fillCircle(x + Math.cos(angle) * 4, y + Math.sin(angle) * 4, 2.6)
      }
      g.fillStyle(accent, 1)
      g.fillCircle(x, y, 2.2)
    }
  }

  // --- Fountains: stone basin with a pulsing water jet.
  for (const circle of shapes.circles) {
    if (circle.kind !== 'fountain') continue
    const { x, y, r } = circle.circle
    g.fillStyle(0x000000, 0.18)
    g.fillCircle(x + 2, y + 4, r)
    g.fillStyle(hex(theme.stone), 1)
    g.fillCircle(x, y, r)
    g.fillStyle(hex(theme.stoneAlt), 1)
    g.fillCircle(x, y, r * 0.72)
    g.fillStyle(0x9fd3e8, 0.9)
    g.fillCircle(x, y, r * 0.55)
    g.lineStyle(2, accent, 0.7)
    g.strokeCircle(x, y, r)
    for (let i = 0; i < 6; i += 1) {
      const angle = time * 2.2 + (i / 6) * Math.PI * 2
      g.fillStyle(0xffffff, 0.55)
      g.fillCircle(x + Math.cos(angle) * r * 0.9, y + Math.sin(angle) * r * 0.9, 1.8)
    }
  }

  // --- Teleporter flowers.
  hole.obstacles?.forEach((obstacle) => {
    if (obstacle.type !== 'teleporter') return
    const x = obstacle.x * CELL
    const y = obstacle.y * CELL
    const tx = obstacle.tx * CELL
    const ty = obstacle.ty * CELL
    const pulse = (Math.sin(time * 3) + 1) / 2
    g.lineStyle(1.5, accent, 0.22 + pulse * 0.16)
    g.strokeCircle(x, y, 14 + pulse * 3)
    g.strokeCircle(tx, ty, 14 + (1 - pulse) * 3)
    for (const [px, py, alpha] of [
      [x, y, 1],
      [tx, ty, 0.85],
    ] as const) {
      g.fillStyle(0x000000, 0.18)
      g.fillCircle(px + 2, py + 3, 12)
      g.fillStyle(hex(theme.hedgeDark), 1)
      g.fillCircle(px, py, 12)
      for (let i = 0; i < 6; i += 1) {
        const angle = (i / 6) * Math.PI * 2 + time * 0.6
        g.fillStyle(hex(theme.flower), alpha)
        g.fillCircle(px + Math.cos(angle) * 6, py + Math.sin(angle) * 6, 3.4)
      }
      g.fillStyle(accent, alpha)
      g.fillCircle(px, py, 3.4)
    }
  })

  // --- Springs.
  hole.obstacles?.forEach((obstacle) => {
    if (obstacle.type !== 'spring') return
    const x = obstacle.x * CELL
    const y = obstacle.y * CELL
    const angle = (obstacle.angle * Math.PI) / 180
    g.fillStyle(hex(theme.flowerAlt), 1)
    g.fillCircle(x, y, 12)
    g.fillStyle(hex(theme.flower), 1)
    g.fillCircle(x, y, 6)
    g.lineStyle(3, accent, 0.9)
    g.lineBetween(x, y, x + Math.cos(angle) * 26, y + Math.sin(angle) * 26)
  })

  // --- Bees: striped body and flickering wings.
  for (const circle of shapes.circles) {
    if (circle.kind !== 'bee') continue
    const { x, y, r } = circle.circle
    const flap = Math.sin(time * 42) * 0.5 + 0.5
    g.fillStyle(0xffffff, 0.55 + flap * 0.3)
    fillEllipse(g, x - r * 0.6, y - r * 1.0, r * 0.85, r * 0.5, 0xffffff, 0.6)
    fillEllipse(g, x + r * 0.6, y - r * 1.0, r * 0.85, r * 0.5, 0xffffff, 0.6)
    g.fillStyle(0x3a3320, 1)
    g.fillCircle(x, y, r)
    g.fillStyle(0xf2c14e, 1)
    g.fillCircle(x, y, r * 0.86)
    g.fillStyle(0x3a3320, 1)
    g.fillRect(x - r * 0.2, y - r * 0.8, r * 0.36, r * 1.6)
    g.fillRect(x + r * 0.45, y - r * 0.7, r * 0.3, r * 1.4)
    g.fillStyle(0xffffff, 0.9)
    g.fillCircle(x - r * 0.35, y - r * 0.15, r * 0.16)
    g.fillCircle(x + r * 0.35, y - r * 0.15, r * 0.16)
  }

  // --- Slopes and wind zones are subtle arrows painted on the turf.
  for (const obstacle of hole.obstacles ?? []) {
    if (obstacle.type !== 'wind' && obstacle.type !== 'slope') continue
    const cx = obstacle.x * CELL
    const cy = obstacle.y * CELL
    const angle = Math.atan2(obstacle.ay, obstacle.ax)
    const strength = clamp(Math.hypot(obstacle.ax, obstacle.ay) / 500, 0, 1)
    g.lineStyle(2, 0xffffff, 0.12 + strength * 0.18)
    for (let i = -2; i <= 2; i += 1) {
      const ox = -Math.sin(angle) * i * 16
      const oy = Math.cos(angle) * i * 16
      const px = cx + ox - Math.cos(angle) * 10
      const py = cy + oy - Math.sin(angle) * 10
      const sway = Math.sin(time * 2 + i) * 3
      g.lineBetween(px + sway, py, px + Math.cos(angle) * 22 + sway, py + Math.sin(angle) * 22)
      g.lineBetween(px + Math.cos(angle) * 22 + sway, py + Math.sin(angle) * 22, px + Math.cos(angle) * 16 + sway - 4, py + Math.sin(angle) * 22 - 4)
    }
  }
}

export function drawFlag(g: Phaser.GameObjects.Graphics, cup: { x: number; y: number }, theme: Theme, time: number): void {
  const poleHeight = 46
  const sway = Math.sin(time * 1.6) * 2.4
  g.fillStyle(0x000000, 0.2)
  g.fillEllipse(cup.x + 2, cup.y + 3, 12, 5)
  g.lineStyle(2.4, 0x6b5a3a, 1)
  g.lineBetween(cup.x, cup.y, cup.x, cup.y - poleHeight)
  g.fillStyle(hex(theme.flag), 0.96)
  g.beginPath()
  g.moveTo(cup.x + 1, cup.y - poleHeight + 2)
  g.lineTo(cup.x + 26 + sway, cup.y - poleHeight + 9)
  g.lineTo(cup.x + 1, cup.y - poleHeight + 20)
  g.closePath()
  g.fillPath()
  g.lineStyle(1, 0x000000, 0.15)
  g.strokePath()
  g.fillStyle(0xffffff, 0.55)
  g.fillCircle(cup.x, cup.y - poleHeight, 2.2)
}

export function drawBall(
  g: Phaser.GameObjects.Graphics,
  ball: { x: number; y: number },
  theme: Theme,
  scale = 1,
  hidden = false,
): void {
  if (hidden) return
  const r = BALL_R * scale
  fillEllipse(g, ball.x + 1.5, ball.y + 2.5, r * 1.05, r * 0.8, 0x000000, 0.28)
  g.fillStyle(0xffffff, 1)
  g.fillCircle(ball.x, ball.y, r)
  g.fillStyle(hex(INK.ballShade), 0.45)
  g.fillCircle(ball.x + r * 0.15, ball.y + r * 0.2, r * 0.82)
  g.fillStyle(0xffffff, 1)
  g.fillCircle(ball.x - r * 0.12, ball.y - r * 0.16, r * 0.7)
  g.fillStyle(hex(INK.ballDimple), 0.5)
  g.fillCircle(ball.x - r * 0.3, ball.y - r * 0.05, r * 0.13)
  g.fillCircle(ball.x + r * 0.2, ball.y - r * 0.32, r * 0.1)
  g.fillCircle(ball.x + r * 0.08, ball.y + r * 0.2, r * 0.12)
  g.lineStyle(1, hex(theme.hedgeDark), 0.25)
  g.strokeCircle(ball.x, ball.y, r)
}

export function drawCupGlow(g: Phaser.GameObjects.Graphics, cup: { x: number; y: number }, time: number, near: boolean): void {
  const pulse = (Math.sin(time * 2.4) + 1) / 2
  const radius = HOLE_R + 5 + pulse * 4
  g.lineStyle(2, 0xffffff, near ? 0.34 : 0.12)
  g.strokeCircle(cup.x, cup.y, radius)
  if (near) {
    g.lineStyle(1, 0xffffff, 0.2)
    g.strokeCircle(cup.x, cup.y, radius + 5)
  }
}

export interface AimVisual {
  origin: { x: number; y: number }
  direction: { x: number; y: number }
  power: number
  path: { x: number; y: number }[]
  pull: { x: number; y: number } | null
}

export function drawAim(g: Phaser.GameObjects.Graphics, aim: AimVisual, theme: Theme, time: number): void {
  const color = aim.power > 0.78 ? hex(INK.powerHot) : hex(INK.power)
  const length = 30 + aim.power * 190
  const tipX = aim.origin.x + aim.direction.x * length
  const tipY = aim.origin.y + aim.direction.y * length

  // Sling band from the ball to the finger.
  if (aim.pull) {
    g.lineStyle(2, 0xffffff, 0.35)
    g.lineBetween(aim.origin.x, aim.origin.y, aim.pull.x, aim.pull.y)
    g.fillStyle(0xffffff, 0.5)
    g.fillCircle(aim.pull.x, aim.pull.y, 4)
  }

  // Direction line.
  g.lineStyle(2, 0xffffff, 0.55)
  g.lineBetween(aim.origin.x, aim.origin.y, tipX, tipY)

  // Predicted path dots.
  for (let i = 1; i < aim.path.length; i += 1) {
    const point = aim.path[i]
    const alpha = 0.55 * (1 - i / aim.path.length) + 0.1
    const size = 2.6 * (1 - i / (aim.path.length * 1.4))
    g.fillStyle(color, alpha)
    g.fillCircle(point.x, point.y, Math.max(1, size))
  }

  // Power arc around the ball.
  const start = -Math.PI / 2
  const end = start + Math.PI * 2 * aim.power
  g.lineStyle(3.5, color, 0.85)
  g.beginPath()
  g.arc(aim.origin.x, aim.origin.y, 18, start, end, false)
  g.strokePath()

  // Arrow head.
  const angle = Math.atan2(aim.direction.y, aim.direction.x)
  g.fillStyle(color, 0.9)
  g.fillTriangle(
    tipX + Math.cos(angle) * 6,
    tipY + Math.sin(angle) * 6,
    tipX + Math.cos(angle + 2.5) * 7,
    tipY + Math.sin(angle + 2.5) * 7,
    tipX + Math.cos(angle - 2.5) * 7,
    tipY + Math.sin(angle - 2.5) * 7,
  )

  // Hint ripple.
  const pulse = (Math.sin(time * 3) + 1) / 2
  g.lineStyle(1.5, hex(theme.accent), 0.28 + pulse * 0.2)
  g.strokeCircle(aim.origin.x, aim.origin.y, 22 + pulse * 2)
}
