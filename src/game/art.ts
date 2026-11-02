/**
 * Procedural garden artwork.
 *
 * Every hole is painted once into an offscreen canvas: terrain, shorelines,
 * hedges, flowers, the cup and the tee. Using Canvas2D instead of hundreds of
 * Phaser objects keeps the scene at a single draw call and gives the board a
 * hand-painted, storybook feel.
 *
 * Two rules keep it looking painted rather than tiled:
 *  - terrain fills are continuous, with detail drawn on top (no per-tile blocks)
 *  - wall cells merge into one silhouette, outlined only where they meet grass
 */

import type Phaser from 'phaser'
import { CELL, FIELD_H, FIELD_W, GRID_COLS, GRID_ROWS } from '../core/constants'
import { hashString, rng } from '../core/math'
import type { HoleDefinition } from '../core/types'
import { buildStaticWorld } from '../core/world'
import type { Theme } from './theme'

type Ctx2D = CanvasRenderingContext2D

interface OpenEdges {
  top: boolean
  right: boolean
  bottom: boolean
  left: boolean
}

function roundRect(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const radius = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + w - radius, y)
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius)
  ctx.lineTo(x + w, y + h - radius)
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h)
  ctx.lineTo(x + radius, y + h)
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const value = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

function shade(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex)
  const mix = (channel: number): number =>
    Math.round(amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount))
  return `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const inField = (col: number, row: number): boolean =>
  col >= 0 && row >= 0 && col < GRID_COLS && row < GRID_ROWS

function charAt(hole: HoleDefinition, col: number, row: number): string {
  if (!inField(col, row)) return '#'
  return hole.grid[row][col] ?? '#'
}

function isWall(char: string): boolean {
  return char === '#'
}

function openEdges(hole: HoleDefinition, col: number, row: number): OpenEdges {
  return {
    top: !isWall(charAt(hole, col, row - 1)),
    bottom: !isWall(charAt(hole, col, row + 1)),
    left: !isWall(charAt(hole, col - 1, row)),
    right: !isWall(charAt(hole, col + 1, row)),
  }
}

function strokeEdges(ctx: Ctx2D, x: number, y: number, edges: OpenEdges, color: string, width = 1.6): void {
  ctx.strokeStyle = color
  ctx.lineWidth = width
  ctx.beginPath()
  if (edges.top) {
    ctx.moveTo(x, y + 0.8)
    ctx.lineTo(x + CELL, y + 0.8)
  }
  if (edges.bottom) {
    ctx.moveTo(x, y + CELL - 0.8)
    ctx.lineTo(x + CELL, y + CELL - 0.8)
  }
  if (edges.left) {
    ctx.moveTo(x + 0.8, y)
    ctx.lineTo(x + 0.8, y + CELL)
  }
  if (edges.right) {
    ctx.moveTo(x + CELL - 0.8, y)
    ctx.lineTo(x + CELL - 0.8, y + CELL)
  }
  ctx.stroke()
}

// ---------------------------------------------------------------------------
// Terrain
// ---------------------------------------------------------------------------

function paintGrass(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, rough: boolean): void {
  ctx.fillStyle = rough ? theme.rough : theme.grass
  ctx.fillRect(x, y, CELL, CELL)

  const bladeColor = rgba(shade(rough ? theme.rough : theme.grass, -0.2), rough ? 0.6 : 0.45)
  ctx.strokeStyle = bladeColor
  ctx.lineWidth = 1
  const blades = rough ? 13 : 7
  for (let i = 0; i < blades; i += 1) {
    const bx = x + 3 + random() * (CELL - 6)
    const by = y + 6 + random() * (CELL - 10)
    const lean = (random() - 0.5) * 3.4
    ctx.beginPath()
    ctx.moveTo(bx, by)
    ctx.quadraticCurveTo(bx + lean, by - 2.4, bx + lean * 1.7, by - 4.6)
    ctx.stroke()
  }

  // Sparse clover: tiny flat dots read as texture from a distance.
  if (!rough && random() > 0.45) {
    ctx.fillStyle = rgba(theme.grassAlt, 0.5)
    ctx.beginPath()
    ctx.arc(x + 6 + random() * (CELL - 12), y + 6 + random() * (CELL - 12), 1.6, 0, Math.PI * 2)
    ctx.fill()
  }

  if (rough) {
    ctx.strokeStyle = rgba(shade(theme.roughAlt, -0.05), 0.55)
    for (let i = 0; i < 3; i += 1) {
      const bx = x + 8 + random() * (CELL - 16)
      const by = y + 12 + random() * (CELL - 18)
      ctx.beginPath()
      ctx.moveTo(bx, by)
      ctx.quadraticCurveTo(bx - 3, by - 5, bx - 7, by - 8)
      ctx.moveTo(bx, by)
      ctx.quadraticCurveTo(bx + 3, by - 5, bx + 7, by - 8)
      ctx.stroke()
    }
  }
}

/** Broad soft light patches over the whole green — variation without seams. */
function paintLightWash(ctx: Ctx2D, theme: Theme, random: () => number): void {
  for (let i = 0; i < 7; i += 1) {
    const cx = random() * FIELD_W
    const cy = random() * FIELD_H
    const radius = 130 + random() * 220
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    gradient.addColorStop(0, rgba(theme.grassAlt, 0.2))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  }
  for (let i = 0; i < 4; i += 1) {
    const cx = random() * FIELD_W
    const cy = random() * FIELD_H
    const radius = 160 + random() * 240
    const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius)
    gradient.addColorStop(0, rgba(theme.hedgeDark, 0.1))
    gradient.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = gradient
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
  }
}

function paintStone(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number): void {
  ctx.fillStyle = theme.stone
  ctx.fillRect(x, y, CELL, CELL)
  const half = CELL / 2
  for (let sy = 0; sy < 2; sy += 1) {
    for (let sx = 0; sx < 2; sx += 1) {
      const jitter = (random() - 0.5) * 1.6
      ctx.fillStyle = random() > 0.5 ? theme.stone : theme.stoneAlt
      roundRect(ctx, x + sx * half + 1.2 + jitter, y + sy * half + 1.2 + jitter, half - 2.4, half - 2.4, 3)
      ctx.fill()
      ctx.strokeStyle = rgba(shade(theme.stoneAlt, -0.28), 0.28)
      ctx.lineWidth = 1
      ctx.stroke()
    }
  }
}

function paintSand(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number): void {
  ctx.fillStyle = theme.sand
  ctx.fillRect(x, y, CELL, CELL)
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = rgba(random() > 0.5 ? theme.sandAlt : '#ffffff', 0.5)
    ctx.fillRect(x + 3 + random() * (CELL - 6), y + 3 + random() * (CELL - 6), 1.5, 1.5)
  }
  ctx.strokeStyle = rgba(theme.sandAlt, 0.35)
  ctx.lineWidth = 1.2
  const yy = y + 12 + random() * 16
  ctx.beginPath()
  ctx.moveTo(x + 4, yy)
  ctx.quadraticCurveTo(x + CELL / 2, yy - 5, x + CELL - 4, yy + 2)
  ctx.stroke()
}

function paintMud(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number): void {
  ctx.fillStyle = theme.mud
  ctx.fillRect(x, y, CELL, CELL)
  for (let i = 0; i < 3; i += 1) {
    ctx.fillStyle = rgba(shade(theme.mud, -0.16), 0.28)
    const w = 12 + random() * 18
    const h = 8 + random() * 12
    ctx.beginPath()
    ctx.ellipse(x + random() * (CELL - w) + w / 2, y + random() * (CELL - h) + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.fillStyle = rgba('#ffffff', 0.12)
  ctx.beginPath()
  ctx.arc(x + 10 + random() * 20, y + 12 + random() * 18, 2, 0, Math.PI * 2)
  ctx.fill()
}

function paintIce(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number): void {
  ctx.fillStyle = theme.ice
  ctx.fillRect(x, y, CELL, CELL)
  ctx.fillStyle = rgba('#ffffff', 0.3)
  ctx.fillRect(x, y, CELL, 3)
  ctx.fillStyle = rgba('#8fc4dd', 0.22)
  ctx.fillRect(x, y + CELL - 5, CELL, 5)
  ctx.strokeStyle = rgba('#ffffff', 0.55)
  ctx.lineWidth = 1.2
  ctx.beginPath()
  const sx = x + 4 + random() * 12
  const sy = y + 6 + random() * 8
  ctx.moveTo(sx, sy)
  ctx.lineTo(sx + 12 + random() * 16, sy + 8 + random() * 12)
  ctx.lineTo(sx + 6 + random() * 8, sy + 24 + random() * 10)
  ctx.stroke()
  ctx.strokeStyle = rgba('#7fb5d6', 0.28)
  ctx.beginPath()
  ctx.moveTo(x + 28, y + 5)
  ctx.lineTo(x + 22, y + 22)
  ctx.stroke()
}

function paintWater(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, row: number): void {
  const depth = row / GRID_ROWS
  ctx.fillStyle = depth > 0.55 ? shade(theme.water, -0.04) : theme.water
  ctx.fillRect(x, y, CELL, CELL)
  ctx.fillStyle = rgba(theme.waterDeep, 0.16)
  ctx.fillRect(x, y + CELL - 7, CELL, 7)
  ctx.strokeStyle = rgba(theme.waterLight, 0.34)
  ctx.lineWidth = 1.5
  const yy = y + 10 + random() * 20
  ctx.beginPath()
  ctx.moveTo(x + 5, yy)
  ctx.quadraticCurveTo(x + CELL / 2, yy - 4, x + CELL - 6, yy + 1)
  ctx.stroke()
  if (random() > 0.6) {
    ctx.fillStyle = rgba('#ffffff', 0.16)
    ctx.fillRect(x + 8 + random() * 18, y + 12 + random() * 16, 7, 1.5)
  }
}

function paintWood(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number): void {
  ctx.fillStyle = theme.wood
  ctx.fillRect(x, y, CELL, CELL)
  for (let plank = 1; plank < 4; plank += 1) {
    const px = x + plank * (CELL / 4)
    ctx.fillStyle = rgba(theme.woodDark, 0.28)
    ctx.fillRect(px, y, 1.4, CELL)
  }
  ctx.strokeStyle = rgba(theme.woodDark, 0.32)
  ctx.lineWidth = 1
  for (let i = 0; i < 3; i += 1) {
    const px = x + 5 + random() * 30
    ctx.beginPath()
    ctx.moveTo(px, y + 4 + random() * 8)
    ctx.lineTo(px + (random() - 0.5) * 2, y + 18 + random() * 16)
    ctx.stroke()
  }
  ctx.fillStyle = rgba(theme.woodDark, 0.45)
  ctx.beginPath()
  ctx.arc(x + 5, y + 5, 1.4, 0, Math.PI * 2)
  ctx.arc(x + CELL - 5, y + CELL - 5, 1.4, 0, Math.PI * 2)
  ctx.fill()
}

function paintConveyor(ctx: Ctx2D, x: number, y: number, theme: Theme, direction: string): void {
  ctx.fillStyle = '#3b4340'
  ctx.fillRect(x, y, CELL, CELL)
  ctx.fillStyle = rgba('#ffffff', 0.06)
  ctx.fillRect(x, y, CELL, 4)
  ctx.strokeStyle = rgba(theme.accent, 0.7)
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  for (let i = 0; i < 2; i += 1) {
    ctx.save()
    ctx.translate(x + 12 + i * 16, y + CELL / 2)
    if (direction === '<') ctx.rotate(Math.PI)
    else if (direction === 'v') ctx.rotate(Math.PI / 2)
    else if (direction === '^') ctx.rotate(-Math.PI / 2)
    ctx.beginPath()
    ctx.moveTo(-4, -5)
    ctx.lineTo(3, 0)
    ctx.lineTo(-4, 5)
    ctx.stroke()
    ctx.restore()
  }
  ctx.strokeStyle = rgba('#000000', 0.3)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y + 2)
  ctx.lineTo(x + CELL, y + 2)
  ctx.moveTo(x, y + CELL - 2)
  ctx.lineTo(x + CELL, y + CELL - 2)
  ctx.stroke()
}

// ---------------------------------------------------------------------------
// Walls — merged silhouettes
// ---------------------------------------------------------------------------

function hedgeCell(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, edges: OpenEdges): void {
  // A per-cell vertical gradient is continuous across neighbours, so a run of
  // hedge reads as one clipped box rather than stacked tiles.
  const gradient = ctx.createLinearGradient(x, y, x, y + CELL)
  gradient.addColorStop(0, shade(theme.hedge, 0.1))
  gradient.addColorStop(0.55, theme.hedge)
  gradient.addColorStop(1, shade(theme.hedgeDark, -0.05))
  ctx.fillStyle = gradient
  ctx.fillRect(x, y, CELL, CELL)

  // Soft leaf texture — low contrast so the grid never shows through.
  for (let i = 0; i < 6; i += 1) {
    const lx = x + 4 + random() * (CELL - 8)
    const ly = y + 6 + random() * (CELL - 10)
    ctx.fillStyle = rgba(random() > 0.5 ? theme.hedgeLight : theme.hedgeDark, 0.16)
    ctx.beginPath()
    ctx.arc(lx, ly, 2.6 + random() * 3.4, 0, Math.PI * 2)
    ctx.fill()
  }

  if (edges.top) {
    ctx.fillStyle = rgba(theme.hedgeLight, 0.62)
    ctx.fillRect(x, y + 1, CELL, 4)
    ctx.fillStyle = rgba('#ffffff', 0.16)
    ctx.fillRect(x, y + 1, CELL, 1.4)
  }
  // A darker base inside the silhouette adds a little weight to the hedge.
  if (edges.bottom) {
    ctx.fillStyle = rgba(theme.hedgeDark, 0.35)
    ctx.fillRect(x, y + CELL - 5, CELL, 5)
  }
  strokeEdges(ctx, x, y, edges, rgba(theme.hedgeDark, 0.85), 1.8)
}

function stoneCell(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, edges: OpenEdges): void {
  ctx.fillStyle = theme.stoneAlt
  ctx.fillRect(x, y, CELL, CELL)
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const bw = CELL / 2 - 2
      const bh = CELL / 3 - 2
      ctx.fillStyle = random() > 0.4 ? theme.stone : shade(theme.stone, -0.08)
      roundRect(ctx, x + col * (CELL / 2) + 1 + (row % 2) * 4, y + row * (CELL / 3) + 1, bw, bh, 2)
      ctx.fill()
    }
  }
  if (edges.top) {
    ctx.fillStyle = rgba('#ffffff', 0.22)
    ctx.fillRect(x, y + 1, CELL, 2)
  }
  strokeEdges(ctx, x, y, edges, rgba('#000000', 0.22))
}

function crystalCell(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, edges: OpenEdges): void {
  ctx.fillStyle = theme.hedgeDark
  ctx.fillRect(x, y, CELL, CELL)
  for (let i = 0; i < 3; i += 1) {
    const fx = x + 4 + random() * (CELL - 20)
    const fy = y + 4 + random() * (CELL - 22)
    const fw = 10 + random() * 12
    const fh = 14 + random() * 18
    ctx.fillStyle = rgba(i % 2 === 0 ? theme.hedgeLight : theme.accent, 0.5)
    ctx.beginPath()
    ctx.moveTo(fx, fy + fh)
    ctx.lineTo(fx + fw / 2, fy)
    ctx.lineTo(fx + fw, fy + fh * 0.8)
    ctx.lineTo(fx + fw * 0.4, fy + fh)
    ctx.closePath()
    ctx.fill()
    ctx.strokeStyle = rgba('#ffffff', 0.28)
    ctx.lineWidth = 1
    ctx.stroke()
  }
  if (edges.top) {
    ctx.fillStyle = rgba(theme.accent, 0.4)
    ctx.fillRect(x, y + 1, CELL, 2.5)
  }
  strokeEdges(ctx, x, y, edges, rgba('#0f0a24', 0.5))
}

function hayCell(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, edges: OpenEdges): void {
  ctx.fillStyle = theme.hedge
  ctx.fillRect(x, y, CELL, CELL)
  for (let band = 0; band < 4; band += 1) {
    ctx.fillStyle = rgba(band % 2 === 0 ? theme.hedgeLight : theme.hedgeDark, 0.34)
    ctx.fillRect(x, y + 3 + band * 10, CELL, 5)
  }
  ctx.strokeStyle = rgba(theme.hedgeLight, 0.45)
  ctx.lineWidth = 1
  for (let i = 0; i < 10; i += 1) {
    const sx = x + 3 + random() * (CELL - 6)
    const sy = y + 4 + random() * (CELL - 8)
    ctx.beginPath()
    ctx.moveTo(sx, sy)
    ctx.lineTo(sx + (random() - 0.5) * 8, sy + (random() - 0.5) * 4)
    ctx.stroke()
  }
  if (edges.top) {
    ctx.fillStyle = rgba('#ffffff', 0.16)
    ctx.fillRect(x, y + 1, CELL, 2)
  }
  strokeEdges(ctx, x, y, edges, rgba('#3d2410', 0.45))
}

function topiaryCell(ctx: Ctx2D, x: number, y: number, theme: Theme, random: () => number, edges: OpenEdges): void {
  ctx.fillStyle = theme.hedge
  ctx.fillRect(x, y, CELL, CELL)
  for (let i = 0; i < 22; i += 1) {
    ctx.fillStyle = rgba(random() > 0.5 ? theme.hedgeLight : theme.hedgeDark, 0.3)
    ctx.beginPath()
    ctx.arc(x + 2 + random() * (CELL - 4), y + 2 + random() * (CELL - 4), 1.3 + random() * 1.9, 0, Math.PI * 2)
    ctx.fill()
  }
  if (edges.top) {
    ctx.fillStyle = rgba(theme.accent, 0.4)
    ctx.fillRect(x, y + 1, CELL, 2.5)
  }
  strokeEdges(ctx, x, y, edges, rgba(theme.hedgeDark, 0.55))
}

function paintWallCell(
  ctx: Ctx2D,
  hole: HoleDefinition,
  col: number,
  row: number,
  theme: Theme,
  random: () => number,
): void {
  const x = col * CELL
  const y = row * CELL
  const edges = openEdges(hole, col, row)
  switch (theme.wallStyle) {
    case 'stone':
      stoneCell(ctx, x, y, theme, random, edges)
      break
    case 'crystal':
      crystalCell(ctx, x, y, theme, random, edges)
      break
    case 'hay':
      hayCell(ctx, x, y, theme, random, edges)
      break
    case 'topiary':
      topiaryCell(ctx, x, y, theme, random, edges)
      break
    default:
      hedgeCell(ctx, x, y, theme, random, edges)
  }

  // Flowers and ivy spilling onto the grass from the garden frame.
  const inner = col === 1 || row === 1 || col === GRID_COLS - 2 || row === GRID_ROWS - 2
  if (inner && random() > 0.5) {
    const fx = x + 6 + random() * (CELL - 12)
    const fy = y + 6 + random() * (CELL - 12)
    ctx.fillStyle = rgba(theme.flower, 0.85)
    for (let petal = 0; petal < 4; petal += 1) {
      const angle = (petal / 4) * Math.PI * 2
      ctx.beginPath()
      ctx.arc(fx + Math.cos(angle) * 2.4, fy + Math.sin(angle) * 2.4, 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.fillStyle = rgba(theme.flowerAlt, 0.95)
    ctx.beginPath()
    ctx.arc(fx, fy, 1.4, 0, Math.PI * 2)
    ctx.fill()
  }
}

/** Soft shadows only where a hedge meets open ground. */
function paintWallShadows(ctx: Ctx2D, hole: HoleDefinition): void {
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      if (!isWall(charAt(hole, col, row))) continue
      const x = col * CELL
      const y = row * CELL
      if (!isWall(charAt(hole, col, row + 1))) {
        for (let i = 0; i < 5; i += 1) {
          ctx.fillStyle = `rgba(0,0,0,${0.17 - i * 0.03})`
          ctx.fillRect(x, y + CELL + i * 3, CELL, 3)
        }
      }
      if (!isWall(charAt(hole, col + 1, row))) {
        for (let i = 0; i < 4; i += 1) {
          ctx.fillStyle = `rgba(0,0,0,${0.12 - i * 0.026})`
          ctx.fillRect(x + CELL + i * 3, y, 3, CELL)
        }
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Shoreline, cup, tee and decoration
// ---------------------------------------------------------------------------

function isWaterChar(char: string): boolean {
  return char === '~'
}

function paintShoreline(ctx: Ctx2D, hole: HoleDefinition, theme: Theme): void {
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      if (!isWaterChar(charAt(hole, col, row))) continue
      const x = col * CELL
      const y = row * CELL
      const neighbours = [
        [0, -1, x, y, CELL, 4],
        [0, 1, x, y + CELL - 4, CELL, 4],
        [-1, 0, x, y, 4, CELL],
        [1, 0, x + CELL - 4, y, 4, CELL],
      ] as const
      for (const [dc, dr, sx, sy, sw, sh] of neighbours) {
        const neighbour = charAt(hole, col + dc, row + dr)
        if (isWaterChar(neighbour) || isWall(neighbour)) continue
        ctx.fillStyle = rgba(theme.waterDeep, 0.28)
        ctx.fillRect(sx, sy, sw, sh)
        ctx.fillStyle = rgba(theme.waterLight, 0.4)
        ctx.fillRect(dc !== 0 ? (dc < 0 ? sx + sw : sx) : sx, dr !== 0 ? (dr < 0 ? sy + sh : sy) : sy, dc !== 0 ? 1.5 : sw, dr !== 0 ? 1.5 : sh)
      }
    }
  }
}

function paintCup(ctx: Ctx2D, cup: { x: number; y: number }, theme: Theme): void {
  ctx.save()
  ctx.translate(cup.x, cup.y)
  ctx.fillStyle = 'rgba(0,0,0,0.26)'
  ctx.beginPath()
  ctx.ellipse(2, 4, 15, 11, 0, 0, Math.PI * 2)
  ctx.fill()

  const well = ctx.createRadialGradient(0, -2, 2, 0, 0, 14)
  well.addColorStop(0, '#0a0f0c')
  well.addColorStop(0.7, '#16201a')
  well.addColorStop(1, '#2c3a30')
  ctx.fillStyle = well
  ctx.beginPath()
  ctx.ellipse(0, 0, 13, 10.5, 0, 0, Math.PI * 2)
  ctx.fill()

  ctx.strokeStyle = rgba(theme.accent, 0.7)
  ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.ellipse(0, 0, 13.4, 10.9, 0, 0, Math.PI * 2)
  ctx.stroke()

  ctx.fillStyle = 'rgba(255,255,255,0.2)'
  ctx.beginPath()
  ctx.ellipse(-3, -3, 4.5, 3, -0.4, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function paintTee(ctx: Ctx2D, tee: { x: number; y: number }, theme: Theme): void {
  ctx.save()
  ctx.translate(tee.x, tee.y)
  ctx.fillStyle = rgba('#ffffff', 0.16)
  ctx.beginPath()
  ctx.arc(0, 0, 15, 0, Math.PI * 2)
  ctx.fill()
  ctx.strokeStyle = rgba(theme.accent, 0.5)
  ctx.lineWidth = 1.2
  ctx.setLineDash([3, 4])
  ctx.beginPath()
  ctx.arc(0, 0, 15, 0, Math.PI * 2)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.restore()
}

function paintFlowers(
  ctx: Ctx2D,
  hole: HoleDefinition,
  theme: Theme,
  random: () => number,
  cup: { x: number; y: number },
  tee: { x: number; y: number },
): void {
  for (let row = 1; row < GRID_ROWS - 1; row += 1) {
    for (let col = 1; col < GRID_COLS - 1; col += 1) {
      const char = charAt(hole, col, row)
      if (char !== '.' && char !== ',') continue
      const x = col * CELL
      const y = row * CELL
      const cx = x + CELL / 2
      const cy = y + CELL / 2
      if (Math.hypot(cx - cup.x, cy - cup.y) < 50) continue
      if (Math.hypot(cx - tee.x, cy - tee.y) < 44) continue
      if (random() > 0.2) continue

      const fx = x + 8 + random() * (CELL - 16)
      const fy = y + 8 + random() * (CELL - 16)
      const petals = 4 + Math.floor(random() * 3)
      const petalColor = random() > 0.5 ? theme.flower : theme.flowerAlt
      for (let i = 0; i < petals; i += 1) {
        const angle = (i / petals) * Math.PI * 2
        ctx.fillStyle = rgba(petalColor, 0.9)
        ctx.beginPath()
        ctx.arc(fx + Math.cos(angle) * 2.5, fy + Math.sin(angle) * 2.5, 1.9, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.fillStyle = rgba(theme.accent, 0.95)
      ctx.beginPath()
      ctx.arc(fx, fy, 1.4, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

function paintBorderGarden(ctx: Ctx2D, theme: Theme): void {
  const gradient = ctx.createRadialGradient(FIELD_W / 2, FIELD_H / 2, FIELD_H * 0.42, FIELD_W / 2, FIELD_H / 2, FIELD_W * 0.72)
  gradient.addColorStop(0, 'rgba(0,0,0,0)')
  gradient.addColorStop(1, rgba(theme.hedgeDark, 0.5))
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, FIELD_W, FIELD_H)
}

function paintNight(ctx: Ctx2D, theme: Theme, random: () => number): void {
  if (theme.night <= 0) return
  ctx.fillStyle = `rgba(10, 18, 46, ${theme.night})`
  ctx.fillRect(0, 0, FIELD_W, FIELD_H)
  if (theme.decor === 'firefly') {
    for (let i = 0; i < 46; i += 1) {
      const x = 20 + random() * (FIELD_W - 40)
      const y = 20 + random() * (FIELD_H - 40)
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 7)
      glow.addColorStop(0, rgba('#fff6b0', 0.95))
      glow.addColorStop(0.35, rgba('#ffe680', 0.4))
      glow.addColorStop(1, 'rgba(255, 230, 128, 0)')
      ctx.fillStyle = glow
      ctx.beginPath()
      ctx.arc(x, y, 7, 0, Math.PI * 2)
      ctx.fill()
    }
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function paintHoleTexture(
  scene: Phaser.Scene,
  courseId: string,
  holeIndex: number,
  hole: HoleDefinition,
  theme: Theme,
): string {
  const key = `board-${courseId}-${holeIndex}`
  if (scene.textures.exists(key)) scene.textures.remove(key)
  const texture = scene.textures.createCanvas(key, FIELD_W, FIELD_H)
  if (!texture) return key
  const ctx = texture.getContext()
  const random = rng(hashString(`${courseId}:${holeIndex}:${theme.id}`))
  const world = buildStaticWorld(hole)

  ctx.fillStyle = theme.hedgeDark
  ctx.fillRect(0, 0, FIELD_W, FIELD_H)

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const char = charAt(hole, col, row)
      if (isWall(char)) continue
      const x = col * CELL
      const y = row * CELL
      switch (char) {
        case '.':
        case 'T':
        case 'H':
          paintGrass(ctx, x, y, theme, random, false)
          break
        case ',':
          paintGrass(ctx, x, y, theme, random, true)
          break
        case ':':
          paintStone(ctx, x, y, theme, random)
          break
        case 's':
          paintSand(ctx, x, y, theme, random)
          break
        case 'm':
          paintMud(ctx, x, y, theme, random)
          break
        case 'i':
          paintIce(ctx, x, y, theme, random)
          break
        case '~':
          paintWater(ctx, x, y, theme, random, row)
          break
        case 'b':
          paintWood(ctx, x, y, theme, random)
          break
        case 't':
          paintStone(ctx, x, y, theme, random)
          break
        case '>':
        case '<':
        case '^':
        case 'v':
          paintGrass(ctx, x, y, theme, random, false)
          paintConveyor(ctx, x, y, theme, char)
          break
        default:
          paintGrass(ctx, x, y, theme, random, false)
      }
    }
  }

  paintLightWash(ctx, theme, random)
  paintShoreline(ctx, hole, theme)
  paintFlowers(ctx, hole, theme, random, world.cup, world.tee)
  paintWallShadows(ctx, hole)

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      if (!isWall(charAt(hole, col, row))) continue
      paintWallCell(ctx, hole, col, row, theme, random)
    }
  }

  paintTee(ctx, world.tee, theme)
  paintCup(ctx, world.cup, theme)
  paintBorderGarden(ctx, theme)
  paintNight(ctx, theme, random)

  texture.refresh()
  return key
}

/** Round spark used for dust, splash and confetti particles. */
export function ensureParticleTexture(scene: Phaser.Scene, key: string, color: string): void {
  if (scene.textures.exists(key)) return
  const texture = scene.textures.createCanvas(key, 16, 16)
  if (!texture) return
  const ctx = texture.getContext()
  const gradient = ctx.createRadialGradient(8, 8, 0, 8, 8, 8)
  gradient.addColorStop(0, color)
  gradient.addColorStop(0.6, rgba(color.startsWith('#') ? color : '#ffffff', 0.7))
  gradient.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = gradient
  ctx.beginPath()
  ctx.arc(8, 8, 8, 0, Math.PI * 2)
  ctx.fill()
  texture.refresh()
}
