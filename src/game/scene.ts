/**
 * The playable hole.
 *
 * Phaser owns rendering and input; `World` owns physics. The scene translates
 * drags into shots, drains physics events into sound and sparkle, and reports a
 * finished hole to the app. No game rules live here.
 */

import Phaser from 'phaser'
import {
  BALL_R,
  CELL,
  FIELD_H,
  FIELD_W,
  SHOT_MAX,
  SHOT_MIN,
  STOP_SPEED,
} from '../core/constants'
import { clamp } from '../core/math'
import type { GameMode, HoleDefinition } from '../core/types'
import { World, type WorldEvent } from '../core/world'
import { getCourse, getHole } from '../core/courses'
import { ensureParticleTexture, paintHoleTexture } from './art'
import { audio } from './audio'
import { bus } from './bus'
import { drawAim, drawBall, drawCupGlow, drawFlag, drawObstacles } from './render'
import { THEMES, type Theme } from './theme'

export interface StartHoleConfig {
  courseId: string
  holeIndex: number
  mode: GameMode
  trickId?: string
  backdrop?: boolean
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  color: number
  gravity: number
}

const MAX_PULL = 250
const PULL_DEADZONE = 14

export class GolfScene extends Phaser.Scene {
  private world: World | null = null
  private hole: HoleDefinition | null = null
  private theme: Theme = THEMES.meadow
  private courseId = 'sunny-meadows'
  private holeIndex = 0
  private mode: GameMode = 'journey'
  private trickId: string | undefined

  private board?: Phaser.GameObjects.Image
  private obstacleLayer!: Phaser.GameObjects.Graphics
  private aimLayer!: Phaser.GameObjects.Graphics
  private ballLayer!: Phaser.GameObjects.Graphics
  private fxLayer!: Phaser.GameObjects.Graphics

  private particles: Particle[] = []
  private bumperPulse = new Map<number, number>()
  private trail: { x: number; y: number; life: number }[] = []

  private aiming = false
  private pull: { x: number; y: number } | null = null
  private power = 0
  private aimAngle = 0
  private keyboardAiming = false
  private previewPath: { x: number; y: number }[] = []
  private lastPreviewKey = ''

  private playable = false
  private paused = false
  private backdrop = false
  private assist = true
  private shakeEnabled = true
  private haptics = true

  private sinkProgress = 0
  private completedAt = 0
  private reported = false
  private animTime = 0
  private trailTimer = 0
  private hintShown = false

  constructor() {
    super('golf')
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#122018')
    this.cameras.main.setRoundPixels(false)

    this.obstacleLayer = this.add.graphics().setDepth(2)
    this.aimLayer = this.add.graphics().setDepth(3)
    this.ballLayer = this.add.graphics().setDepth(4)
    this.fxLayer = this.add.graphics().setDepth(5)

    ensureParticleTexture(this, 'spark-white', '#ffffff')
    ensureParticleTexture(this, 'spark-gold', '#ffe08a')
    ensureParticleTexture(this, 'spark-water', '#bfe9ff')
    ensureParticleTexture(this, 'spark-leaf', '#9fdc7a')

    this.input.on('pointerdown', this.onPointerDown, this)
    this.input.on('pointermove', this.onPointerMove, this)
    this.input.on('pointerup', this.onPointerUp, this)
    this.input.on('pointerupoutside', this.onPointerUp, this)

    const keyboard = this.input.keyboard
    if (keyboard) {
      keyboard.on('keydown-LEFT', this.rotateAim(-1))
      keyboard.on('keydown-RIGHT', this.rotateAim(1))
      keyboard.on('keydown-UP', this.adjustPower(1))
      keyboard.on('keydown-DOWN', this.adjustPower(-1))
      keyboard.on('keydown-SPACE', this.keyboardShoot)
      keyboard.on('keydown-R', this.restartHole)
      keyboard.on('keydown-ESC', () => bus.emit('scene:pauseRequested'))
    }

    this.input.on('pointerdown', () => audio.unlock())
    bus.on('app:assist', (enabled: boolean) => {
      this.assist = enabled
    })
    bus.on('app:shake', (enabled: boolean) => {
      this.shakeEnabled = enabled
    })
    bus.on('app:haptics', (enabled: boolean) => {
      this.haptics = enabled
    })

    bus.emit('scene:ready')
    this.loadBackdrop()
  }

  // -------------------------------------------------------------------------
  // Hole lifecycle
  // -------------------------------------------------------------------------

  private loadBackdrop(): void {
    if (this.world) return
    this.startHole({ courseId: 'sunny-meadows', holeIndex: 0, mode: 'zen', backdrop: true })
  }

  startHole(config: StartHoleConfig): void {
    const hole = getHole(config.courseId, config.holeIndex)
    const course = getCourse(config.courseId)
    if (!hole || !course) return

    this.courseId = config.courseId
    this.holeIndex = config.holeIndex
    this.mode = config.mode
    this.trickId = config.trickId
    this.theme = THEMES[course.theme]
    this.hole = hole
    this.backdrop = config.backdrop ?? false
    this.world = new World(hole)
    this.sinkProgress = 0
    this.completedAt = 0
    this.reported = false
    this.aiming = false
    this.pull = null
    this.power = 0
    this.previewPath = []
    this.lastPreviewKey = ''
    this.particles = []
    this.trail = []
    this.bumperPulse.clear()
    this.hintShown = false
    this.playable = !this.backdrop
    this.paused = false

    const key = paintHoleTexture(this, config.courseId, config.holeIndex, hole, this.theme)
    this.board?.destroy()
    this.board = this.add.image(0, 0, key).setOrigin(0, 0).setDepth(0)

    if (this.scale.width !== FIELD_W || this.scale.height !== FIELD_H) {
      this.scale.resize(FIELD_W, FIELD_H)
    }

    audio.startAmbience(course.theme)
    this.emitHud()
  }

  setPlayable(playable: boolean): void {
    this.playable = playable
    if (!playable) {
      this.aiming = false
      this.pull = null
      this.previewPath = []
    }
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      this.aiming = false
      this.pull = null
    }
  }

  setAssist(enabled: boolean): void {
    this.assist = enabled
  }

  restartHole(): void {
    if (!this.world || !this.playable) return
    this.world.restart()
    this.sinkProgress = 0
    this.completedAt = 0
    this.reported = false
    this.trail = []
    this.previewPath = []
    this.emitHud()
  }

  // -------------------------------------------------------------------------
  // Input
  // -------------------------------------------------------------------------

  private canAim(): boolean {
    return !!this.world && this.playable && !this.paused && !this.backdrop && this.world.canShoot() && !this.reported
  }

  private onPointerDown(pointer: Phaser.Input.Pointer): void {
    audio.unlock()
    if (!this.canAim()) return
    this.aiming = true
    this.keyboardAiming = false
    this.pull = { x: pointer.worldX, y: pointer.worldY }
    this.updateAim()
  }

  private onPointerMove(pointer: Phaser.Input.Pointer): void {
    if (!this.aiming || !this.pull) return
    this.pull = { x: pointer.worldX, y: pointer.worldY }
    this.updateAim()
  }

  private onPointerUp(): void {
    if (!this.aiming) return
    this.aiming = false
    if (!this.world || !this.canAim()) {
      this.pull = null
      this.power = 0
      return
    }
    if (this.power >= 0.05) {
      this.takeShot(this.aimAngle, this.powerFromDrag())
    }
    this.pull = null
    this.power = 0
    this.previewPath = []
    this.lastPreviewKey = ''
  }

  private powerFromDrag(): number {
    if (!this.world || !this.pull) return 0
    const distance = Math.hypot(this.pull.x - this.world.ball.x, this.pull.y - this.world.ball.y)
    return clamp((distance - PULL_DEADZONE) / MAX_PULL, 0, 1)
  }

  private updateAim(): void {
    if (!this.world || !this.pull) return
    const dx = this.world.ball.x - this.pull.x
    const dy = this.world.ball.y - this.pull.y
    if (Math.hypot(dx, dy) < 1) return
    this.aimAngle = Math.atan2(dy, dx)
    this.power = this.powerFromDrag()
    this.refreshPreview()
  }

  private rotateAim(direction: number): () => void {
    return () => {
      if (!this.canAim()) return
      this.keyboardAiming = true
      this.aimAngle += direction * 0.045
      if (this.power < 0.12) this.power = 0.35
      this.refreshPreview()
    }
  }

  private adjustPower(direction: number): () => void {
    return () => {
      if (!this.canAim()) return
      this.keyboardAiming = true
      this.power = clamp(this.power + direction * 0.05, 0.05, 1)
      if (this.power < 0.12) this.power = 0.12
      this.refreshPreview()
    }
  }

  private keyboardShoot = (): void => {
    if (!this.canAim()) return
    if (!this.keyboardAiming) {
      this.keyboardAiming = true
      if (this.power < 0.12) this.power = 0.4
    }
    this.takeShot(this.aimAngle, this.power)
  }

  private speedForPower(power: number): number {
    return SHOT_MIN + clamp(power, 0, 1) * (SHOT_MAX - SHOT_MIN)
  }

  private takeShot(angle: number, power: number): void {
    if (!this.world) return
    const speed = this.speedForPower(power)
    const ok = this.world.shoot(Math.cos(angle) * speed, Math.sin(angle) * speed)
    if (!ok) return
    this.power = 0
    this.keyboardAiming = false
    this.previewPath = []
    this.lastPreviewKey = ''
    audio.putt(power)
    if (this.haptics && 'vibrate' in navigator) navigator.vibrate?.(Math.round(10 + power * 22))
    this.emitHud()
  }

  private refreshPreview(): void {
    if (!this.world) return
    if (!this.assist) {
      this.previewPath = []
      return
    }
    const key = `${this.aimAngle.toFixed(3)}:${this.power.toFixed(2)}`
    if (key === this.lastPreviewKey) return
    this.lastPreviewKey = key
    const speed = this.speedForPower(this.power)
    const preview = this.world.predictPath(Math.cos(this.aimAngle) * speed, Math.sin(this.aimAngle) * speed, 2.2)
    this.previewPath = preview.points.slice(0, 80)
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(_time: number, delta: number): void {
    if (!this.world) return
    const dt = Math.min(delta, 48) / 1000
    this.animTime += dt

    if (!this.paused) {
      this.world.update(dt)
      this.consumeEvents()
      this.updateParticles(dt)
      this.updateTrail(dt)
      if (this.world.state === 'sunk') this.sinkProgress = Math.min(1, this.sinkProgress + dt * 2.6)
    }

    if (this.completedAt && !this.reported && this.animTime * 1000 >= this.completedAt) {
      this.reportHole()
    }

    this.draw()
  }

  private consumeEvents(): void {
    if (!this.world) return
    const events = this.world.drainEvents()
    for (const event of events) this.handleEvent(event)
  }

  private handleEvent(event: WorldEvent): void {
    switch (event.kind) {
      case 'wall': {
        const strength = event.strength ?? 0
        audio.bounce(strength)
        if (strength > 60) this.spawnBurst(event.x, event.y, 3, 0xe9e2cd, 60, 0.4)
        if (strength > 420) {
          if (this.shakeEnabled) this.cameras.main.shake(90, 0.0022)
          if (this.haptics && 'vibrate' in navigator) navigator.vibrate?.(12)
        }
        break
      }
      case 'bumper': {
        audio.bumper()
        this.spawnBurst(event.x, event.y, 10, 0xffe08a, 150, 0.6)
        for (let i = 0; i < 8; i += 1) this.bumperPulse.set(i, 1)
        if (this.haptics && 'vibrate' in navigator) navigator.vibrate?.(18)
        break
      }
      case 'water': {
        audio.splash()
        this.spawnBurst(event.x, event.y, 22, 0xbfe9ff, 170, 0.8)
        if (this.shakeEnabled) this.cameras.main.shake(140, 0.003)
        if (this.haptics && 'vibrate' in navigator) navigator.vibrate?.([20, 40, 20])
        this.emitHud()
        break
      }
      case 'sink': {
        audio.sink()
        this.spawnBurst(this.world?.cup.x ?? 0, this.world?.cup.y ?? 0, 26, 0xfff3c9, 190, 0.9)
        this.cameras.main.flash(220, 255, 246, 210, false)
        this.completedAt = this.animTime * 1000 + 1250
        if (this.haptics && 'vibrate' in navigator) navigator.vibrate?.(30)
        break
      }
      case 'teleport': {
        audio.chime()
        this.spawnBurst(event.x, event.y, 18, 0xc9b3ff, 170, 0.7)
        break
      }
      case 'spring': {
        audio.bumper()
        this.spawnBurst(event.x, event.y, 12, 0xb6f08a, 150, 0.6)
        break
      }
      case 'fountain': {
        if (Math.random() < 0.15) this.spawnBurst(event.x, event.y, 3, 0xbfe9ff, 90, 0.5)
        break
      }
      case 'stop': {
        this.emitHud()
        break
      }
      default:
        break
    }
  }

  private reportHole(): void {
    if (!this.world || !this.hole || this.reported) return
    this.reported = true
    this.playable = false
    this.aiming = false
    this.previewPath = []
    const strokes = this.world.strokes
    const par = this.hole.par
    audio.sink()
    if (strokes === 1) audio.chime()
    else if (strokes <= par) audio.birdie()
    this.spawnBurst(this.world.cup.x, this.world.cup.y, 40, 0xffe08a, 240, 1.2)
    bus.emit('scene:complete', {
      courseId: this.courseId,
      holeIndex: this.holeIndex,
      strokes,
      par,
      wallHits: this.world.wallHits,
      bumperHits: this.world.bumperHits,
      sandTouches: this.world.sandTouches,
      waterHits: this.world.waterHits,
      teleports: this.world.teleports,
    })
  }

  private emitHud(): void {
    if (!this.world || !this.hole) return
    const course = getCourse(this.courseId)
    const speed = Math.hypot(this.world.ball.vx, this.world.ball.vy)
    bus.emit('scene:hud', {
      courseId: this.courseId,
      courseName: course?.name ?? '',
      holeIndex: this.holeIndex,
      holeName: this.hole.name,
      par: this.hole.par,
      strokes: this.world.strokes,
      moving: speed > STOP_SPEED,
      hazard: this.world.state === 'hazard',
      mode: this.mode,
      trickId: this.trickId,
      wallHits: this.world.wallHits,
      bumperHits: this.world.bumperHits,
      sandTouches: this.world.sandTouches,
      teleports: this.world.teleports,
      hint: this.hole.hint,
    })
  }

  // -------------------------------------------------------------------------
  // Drawing
  // -------------------------------------------------------------------------

  private updateTrail(dt: number): void {
    if (!this.world) return
    for (const point of this.trail) point.life -= dt
    this.trail = this.trail.filter((point) => point.life > 0)
    this.trailTimer += dt
    const speed = Math.hypot(this.world.ball.vx, this.world.ball.vy)
    if (speed > 40 && this.trailTimer > 0.035) {
      this.trailTimer = 0
      this.trail.push({ x: this.world.ball.x, y: this.world.ball.y, life: 0.32 })
      if (this.trail.length > 18) this.trail.shift()
    }
  }

  private spawnBurst(x: number, y: number, count: number, color: number, speed: number, life: number): void {
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2
      const velocity = speed * (0.35 + Math.random() * 0.8)
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        life: life * (0.6 + Math.random() * 0.6),
        maxLife: life,
        size: 1.4 + Math.random() * 2.6,
        color,
        gravity: 160 + Math.random() * 120,
      })
    }
    if (this.particles.length > 260) this.particles.splice(0, this.particles.length - 260)
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt
      particle.x += particle.vx * dt
      particle.y += particle.vy * dt
      particle.vy += particle.gravity * dt
      particle.vx *= 0.98
    }
    this.particles = this.particles.filter((particle) => particle.life > 0)
    for (const [index, value] of this.bumperPulse) {
      const next = value - dt * 5
      if (next <= 0) this.bumperPulse.delete(index)
      else this.bumperPulse.set(index, next)
    }
  }

  private draw(): void {
    if (!this.world || !this.hole) return
    const world = this.world

    this.obstacleLayer.clear()
    drawObstacles(this.obstacleLayer, this.hole, this.theme, this.animTime, this.bumperPulse)
    drawFlag(this.obstacleLayer, world.cup, this.theme, this.animTime)

    const near = Math.hypot(world.ball.x - world.cup.x, world.ball.y - world.cup.y) < 70 && !this.backdrop
    drawCupGlow(this.obstacleLayer, world.cup, this.animTime, near)

    // Aim + trail + ball.
    this.aimLayer.clear()
    const showAim = (this.aiming || this.keyboardAiming) && this.playable && !this.paused && world.canShoot() && !this.reported
    if (showAim && this.power > 0.02) {
      drawAim(
        this.aimLayer,
        {
          origin: { x: world.ball.x, y: world.ball.y },
          direction: { x: Math.cos(this.aimAngle), y: Math.sin(this.aimAngle) },
          power: this.power,
          path: this.previewPath,
          pull: this.aiming ? this.pull : null,
        },
        this.theme,
        this.animTime,
      )
    }

    this.ballLayer.clear()
    for (const point of this.trail) {
      const alpha = Math.max(0, point.life / 0.32) * 0.25
      this.ballLayer.fillStyle(0xffffff, alpha)
      this.ballLayer.fillCircle(point.x, point.y, BALL_R * 0.6)
    }
    if (!this.backdrop && world.state !== 'hazard') {
      const scale = 1 - this.sinkProgress * 0.82
      drawBall(this.ballLayer, { x: world.ball.x, y: world.ball.y + this.sinkProgress * 5 }, this.theme, scale)
    }

    this.fxLayer.clear()
    for (const particle of this.particles) {
      const alpha = clamp(particle.life / particle.maxLife, 0, 1)
      this.fxLayer.fillStyle(particle.color, alpha)
      this.fxLayer.fillCircle(particle.x, particle.y, particle.size * (0.5 + alpha * 0.6))
    }

    // Pulsing ring around the tee while the player is deciding.
    if (!this.backdrop && world.canShoot() && !this.aiming && !this.keyboardAiming && this.playable && !this.paused) {
      const pulse = (Math.sin(this.animTime * 2.2) + 1) / 2
      this.aimLayer.lineStyle(1.5, 0xffffff, 0.16 + pulse * 0.12)
      this.aimLayer.strokeCircle(world.ball.x, world.ball.y, 15 + pulse * 2.5)
    }
  }
}

/** Exposed for the app to place the ball exactly for tests or tutorials. */
export const FIELD = { width: FIELD_W, height: FIELD_H, cell: CELL, ballRadius: BALL_R }
