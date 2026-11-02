/**
 * Application state: the save file, the round in progress and the rules that
 * connect them. This is the only place that decides what a finished hole means.
 */

import { TRICK_SHOTS, trickById, trickCompleted, trickProgressText } from './core/challenges'
import { COURSES, getCourse, getHole, nextCourse } from './core/courses'
import { dailyKey, dailySelection, updateDailyStreak } from './core/daily'
import { formatClock } from './core/math'
import { scoreLabel } from './core/scoring'
import type { GameMode } from './core/types'
import {
  awardAchievement,
  courseBestTotal,
  courseProgress,
  isCourseUnlocked,
  loadSave,
  nextLockedCourse,
  recordHole,
  resetProgress,
  totalStars,
  writeSave,
  type SaveData,
  type Settings,
} from './core/save'
import { audio } from './game/audio'
import { bus } from './game/bus'
import type { GolfScene } from './game/scene'
import type { UI } from './ui/ui'

interface RoundResult {
  holeIndex: number
  strokes: number
  par: number
  stars: number
}

interface Round {
  mode: GameMode
  courseId: string
  order: number[]
  index: number
  results: RoundResult[]
  startedAt: number
  trickId?: string
  dailyKey?: string
}

export class App {
  save: SaveData = loadSave()
  round: Round | null = null
  private ui: UI | null = null
  private scene: GolfScene | null = null
  private mode: GameMode = 'journey'

  constructor() {
    this.bind()
  }

  attachUI(ui: UI): void {
    this.ui = ui
  }

  attachScene(scene: GolfScene): void {
    this.scene = scene
    this.applySettings()
    this.showMenu()
  }

  private bind(): void {
    bus.on('app:journey', () => this.openCourses('journey'))
    bus.on('app:freeplay', () => this.openCourses('free'))
    bus.on('app:timeattack', () => this.openCourses('timeattack'))
    bus.on('app:zen', () => this.openCourses('zen'))
    bus.on('app:menu', () => this.showMenu())
    bus.on('app:courses', () => this.openCourses(this.mode))
    bus.on('app:course', (payload: { courseId: string }) => this.openHoles(payload.courseId))
    bus.on('app:play', (payload: { courseId: string; holeIndex?: number; mode?: GameMode }) =>
      this.startRound(payload.courseId, payload.mode ?? 'free', payload.holeIndex ?? 0),
    )
    bus.on('app:next', () => this.next())
    bus.on('app:retryHole', () => this.retryHole())
    bus.on('app:finishRound', () => this.finishRound())
    bus.on('app:pause', () => this.pause())
    bus.on('app:resume', () => this.resume())
    bus.on('app:restartHole', () => this.restartHole())
    bus.on('app:daily', () => this.openDaily())
    bus.on('app:dailyPlay', () => this.playDaily())
    bus.on('app:settingsBack', () => (this.round ? this.resume() : this.showMenu()))
    bus.on('app:locked', () => {
      audio.fail()
      this.ui?.toast({ title: 'Still growing', text: 'Earn more stars in earlier gardens to open this one.', kind: 'info' })
    })
    bus.on('app:tricks', () => this.openTricks())
    bus.on('app:trick', (payload: { id: string }) => this.playTrick(payload.id))
    bus.on('app:settings', () => this.ui?.showSettings({ save: this.save }))
    bus.on('app:howto', () => this.ui?.showHowTo())
    bus.on('app:setting', (patch: Partial<Settings>) => this.updateSettings(patch))
    bus.on('app:resetProgress', () => this.resetProgress())
    bus.on('scene:pauseRequested', () => this.pause())
    bus.on('scene:hud', (payload: any) => this.onHud(payload))
    bus.on('scene:complete', (payload: any) => this.onComplete(payload))
  }

  // -------------------------------------------------------------------------
  // Navigation
  // -------------------------------------------------------------------------

  private backdropFor(save: SaveData): { courseId: string; holeIndex: number } {
    const stars = totalStars(save)
    const unlocked = COURSES.filter((course) => isCourseUnlocked(save, course.id))
    const course = unlocked[Math.min(unlocked.length - 1, Math.floor(stars / 18))] ?? COURSES[0]
    return { courseId: course.id, holeIndex: stars % 9 }
  }

  showMenu(): void {
    this.round = null
    this.mode = 'journey'
    const backdrop = this.backdropFor(this.save)
    this.scene?.startHole({ ...backdrop, mode: 'zen', backdrop: true })
    this.scene?.setPlayable(false)
    this.ui?.showMenu({
      save: this.save,
      stars: totalStars(this.save),
      nextLocked: nextLockedCourse(this.save),
      achievements: this.save.achievements.length,
      totalAchievements: 15,
    })
  }

  private openCourses(mode: GameMode): void {
    this.mode = mode
    this.ui?.showCourses({ save: this.save, mode, stars: totalStars(this.save) })
  }

  private openHoles(courseId: string): void {
    if (!isCourseUnlocked(this.save, courseId)) {
      this.ui?.toast({ title: 'Still growing', text: 'Earn more stars to open this garden.' })
      audio.fail()
      return
    }
    this.ui?.showHoles({ save: this.save, courseId, mode: this.mode })
  }

  private openDaily(): void {
    const selection = dailySelection()
    this.ui?.showDaily({
      save: this.save,
      selection,
      best: this.save.daily.best[selection.key],
      playedToday: this.save.daily.lastPlayed === selection.key,
    })
  }

  private openTricks(): void {
    this.ui?.showTricks({ save: this.save, shots: TRICK_SHOTS })
  }

  // -------------------------------------------------------------------------
  // Rounds
  // -------------------------------------------------------------------------

  private startRound(courseId: string, mode: GameMode, holeIndex: number): void {
    const course = getCourse(courseId)
    if (!course) return
    let order: number[]
    if (mode === 'free') order = [Math.max(0, Math.min(course.holes.length - 1, holeIndex))]
    else order = course.holes.map((_hole, index) => index)

    this.mode = mode
    this.round = { mode, courseId, order, index: 0, results: [], startedAt: Date.now() }
    this.ui?.hidePanels()
    this.scene?.setPaused(false)
    this.scene?.startHole({ courseId, holeIndex: order[0], mode })
    audio.startAmbience(course.theme)
  }

  private playTrick(id: string): void {
    const shot = trickById(id)
    if (!shot) return
    const course = getCourse(shot.courseId)
    if (!course) return
    this.mode = 'trick'
    this.round = {
      mode: 'trick',
      courseId: shot.courseId,
      order: [shot.holeIndex],
      index: 0,
      results: [],
      startedAt: Date.now(),
      trickId: id,
    }
    this.ui?.hidePanels()
    this.scene?.setPaused(false)
    this.scene?.startHole({ courseId: shot.courseId, holeIndex: shot.holeIndex, mode: 'trick', trickId: id })
    audio.startAmbience(course.theme)
  }

  private playDaily(): void {
    const selection = dailySelection()
    this.mode = 'daily'
    this.round = {
      mode: 'daily',
      courseId: selection.courseId,
      order: [selection.holeIndex],
      index: 0,
      results: [],
      startedAt: Date.now(),
      dailyKey: selection.key,
    }
    this.ui?.hidePanels()
    this.scene?.setPaused(false)
    this.scene?.startHole({ courseId: selection.courseId, holeIndex: selection.holeIndex, mode: 'daily' })
    audio.startAmbience(getCourse(selection.courseId)?.theme ?? 'meadow')
  }

  private onHud(payload: any): void {
    const round = this.round
    const priorStrokes = round ? round.results.reduce((sum, result) => sum + result.strokes, 0) : 0
    const priorPar = round ? round.results.reduce((sum, result) => sum + result.par, 0) : 0
    const course = getCourse(payload.courseId)
    let trickText: string | undefined
    let trickDescription: string | undefined
    if (payload.trickId) {
      const shot = trickById(payload.trickId)
      if (shot) {
        trickText = trickProgressText(shot, {
          strokes: payload.strokes,
          wallHits: payload.wallHits,
          bumperHits: payload.bumperHits,
          sandTouches: payload.sandTouches,
          teleports: payload.teleports,
        })
        trickDescription = shot.description
      }
    }
    this.ui?.updateHud({
      ...payload,
      courseName: course?.name ?? payload.courseName,
      totalStrokes: priorStrokes + payload.strokes,
      totalPar: priorPar,
      holeNumber: round ? round.index + 1 : 1,
      totalHoles: round ? round.order.length : 9,
      elapsed: round?.mode === 'timeattack' ? Date.now() - round.startedAt : 0,
      trickText,
      trickDescription,
    })
  }

  private onComplete(payload: {
    courseId: string
    holeIndex: number
    strokes: number
    par: number
    wallHits: number
    bumperHits: number
    sandTouches: number
    waterHits: number
    teleports: number
  }): void {
    const round = this.round
    if (!round) return
    const hole = getHole(round.courseId, payload.holeIndex)
    const course = getCourse(round.courseId)
    if (!hole || !course) return

    const unlockedBefore = new Set(COURSES.filter((entry) => isCourseUnlocked(this.save, entry.id)).map((entry) => entry.id))
    const record = recordHole(this.save, round.courseId, payload.holeIndex, payload.strokes, round.mode)
    round.results.push({
      holeIndex: payload.holeIndex,
      strokes: payload.strokes,
      par: hole.par,
      stars: record.stars,
    })

    let trick: { won: boolean; name: string; description: string } | null = null
    if (round.mode === 'trick' && round.trickId) {
      const shot = trickById(round.trickId)
      if (shot) {
        const won = trickCompleted(shot, {
          strokes: payload.strokes,
          wallHits: payload.wallHits,
          bumperHits: payload.bumperHits,
          sandTouches: payload.sandTouches,
          teleports: payload.teleports,
        })
        trick = { won, name: shot.name, description: shot.description }
        if (won && !this.save.trickShots[shot.id]) {
          this.save.trickShots[shot.id] = true
          const achievement = awardAchievement(this.save, 'trickster')
          if (achievement) this.ui?.toast({ title: achievement.name, text: achievement.description, kind: 'achievement' })
        }
      }
    }

    if (round.mode === 'daily') {
      const key = round.dailyKey ?? dailyKey()
      const previous = this.save.daily.best[key]
      if (previous === undefined || payload.strokes < previous) this.save.daily.best[key] = payload.strokes
      updateDailyStreak(this.save.daily, key)
    }

    writeSave(this.save)

    for (const achievement of record.newAchievements) {
      this.ui?.toast({ title: achievement.name, text: achievement.description, kind: 'achievement' })
    }
    for (const entry of COURSES) {
      if (!unlockedBefore.has(entry.id) && isCourseUnlocked(this.save, entry.id)) {
        this.ui?.toast({ title: 'New garden unlocked', text: `${entry.name} is ready to play.`, kind: 'unlock' })
        audio.fanfare()
      }
    }

    const isLast = round.index >= round.order.length - 1
    const single = round.order.length === 1
    const totalStrokes = round.results.reduce((sum, result) => sum + result.strokes, 0)
    const totalPar = round.results.reduce((sum, result) => sum + result.par, 0)
    const label = scoreLabel(payload.strokes, payload.par)

    this.scene?.setPlayable(false)
    this.ui?.showHoleResult({
      courseId: round.courseId,
      courseName: course.name,
      holeNumber: round.index + 1,
      totalHoles: round.order.length,
      holeName: hole.name,
      strokes: payload.strokes,
      par: payload.par,
      stars: record.stars,
      label: payload.strokes === 1 ? 'Hole in one!' : label.label,
      relative: label.relative,
      isBest: record.isBest,
      previousBest: record.previousBest,
      totalStrokes,
      totalPar,
      mode: round.mode,
      isLast,
      single,
      trick,
      dailyBest: round.mode === 'daily' ? this.save.daily.best[round.dailyKey ?? dailyKey()] : undefined,
      streak: this.save.daily.streak,
      courseCompleted: courseProgress(this.save, course.id).completed >= course.holes.length,
    })
  }

  private next(): void {
    const round = this.round
    if (!round) {
      this.showMenu()
      return
    }
    if (round.index < round.order.length - 1) {
      round.index += 1
      this.ui?.hidePanels()
      this.scene?.setPaused(false)
      this.scene?.startHole({
        courseId: round.courseId,
        holeIndex: round.order[round.index],
        mode: round.mode,
        trickId: round.trickId,
      })
      return
    }
    if (round.order.length === 1) {
      this.showMenu()
      return
    }
    this.finishRound()
  }

  private retryHole(): void {
    const round = this.round
    if (!round) return
    this.ui?.hidePanels()
    this.scene?.setPaused(false)
    if (round.results.length > round.index) round.results.pop()
    this.scene?.startHole({
      courseId: round.courseId,
      holeIndex: round.order[round.index],
      mode: round.mode,
      trickId: round.trickId,
    })
  }

  private restartHole(): void {
    if (!this.round) return
    this.scene?.restartHole()
  }

  private pause(): void {
    if (!this.round) return
    this.scene?.setPaused(true)
    this.ui?.showPause({ save: this.save, mode: this.round.mode })
  }

  private resume(): void {
    this.scene?.setPaused(false)
    this.ui?.hidePanels()
  }

  private finishRound(): void {
    const round = this.round
    if (!round) {
      this.showMenu()
      return
    }
    const course = getCourse(round.courseId)
    if (!course) return

    const totalStrokes = round.results.reduce((sum, result) => sum + result.strokes, 0)
    const totalPar = round.results.reduce((sum, result) => sum + result.par, 0)
    const starsEarned = round.results.reduce((sum, result) => sum + result.stars, 0)
    const elapsed = Date.now() - round.startedAt

    let bestTime: { timeMs: number; strokes: number } | null = null
    let newRecord = false
    if (round.mode === 'timeattack') {
      const previous = this.save.timeAttack[round.courseId]
      newRecord = !previous || elapsed < previous.timeMs
      if (newRecord) {
        this.save.timeAttack[round.courseId] = { timeMs: elapsed, strokes: totalStrokes }
        writeSave(this.save)
      }
      bestTime = this.save.timeAttack[round.courseId] ?? null
    }

    const collection = nextCourse(round.courseId)
    this.ui?.showScorecard({
      course,
      mode: round.mode,
      results: round.results,
      totalStrokes,
      totalPar,
      starsEarned,
      totalStars: totalStars(this.save),
      bestTotal: courseBestTotal(this.save, round.courseId),
      elapsed,
      bestTime,
      newRecord,
      nextCourse: collection
        ? { id: collection.id, name: collection.name, unlocked: isCourseUnlocked(this.save, collection.id), starsRequired: collection.starsRequired }
        : null,
      nextLocked: nextLockedCourse(this.save),
      timeLabel: formatClock(elapsed),
      courseCompleted: courseProgress(this.save, course.id).completed >= course.holes.length,
    })
    this.scene?.setPlayable(false)
  }

  private updateSettings(patch: Partial<Settings>): void {
    this.save.settings = { ...this.save.settings, ...patch }
    writeSave(this.save)
    this.applySettings()
    this.ui?.showSettings({ save: this.save })
  }

  private resetProgress(): void {
    this.save = resetProgress(this.save)
    writeSave(this.save)
    this.showMenu()
    this.ui?.toast({ title: 'Fresh soil', text: 'Progress reset. Every garden is waiting.', kind: 'info' })
  }

  private applySettings(): void {
    audio.setSound(this.save.settings.sound)
    audio.setAmbience(this.save.settings.ambience)
    this.scene?.setAssist(this.save.settings.assist)
    bus.emit('app:shake', this.save.settings.shake)
    bus.emit('app:haptics', this.save.settings.haptics)
  }

  /** Used by the daily screen's play button, which is not part of bind(). */
  playDailySelection(): void {
    this.playDaily()
  }

  get currentMode(): GameMode {
    return this.mode
  }

  get courseSummary(): string {
    return `72 holes · ${COURSES.length} gardens`
  }
}
