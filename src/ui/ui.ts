/**
 * Presentation layer: menus, HUD, results and toasts.
 *
 * The UI never owns game state. It renders what the app hands it and emits
 * intents on the bus. That keeps the canvas free to be the game and the DOM free
 * to be crisp text at any zoom.
 */

import { COURSES, getCourse, getHole } from '../core/courses'
import type { TrickShot } from '../core/types'
import type { DailySelection } from '../core/daily'
import { dailyHoleName } from '../core/daily'
import { formatClock } from '../core/math'
import { relativeTotal, starsToRating, totalPar } from '../core/scoring'
import { courseProgress, isCourseUnlocked, totalStars, type SaveData, type Settings } from '../core/save'
import type { CourseDefinition, GameMode } from '../core/types'
import { audio } from '../game/audio'
import { bus } from '../game/bus'

interface MenuData {
  save: SaveData
  stars: number
  nextLocked: { id: string; name: string; starsRequired: number; missing: number } | null
  achievements: number
  totalAchievements: number
}

interface CoursesData {
  save: SaveData
  mode: GameMode
  stars: number
}

interface HolesData {
  save: SaveData
  courseId: string
  mode: GameMode
}

interface HudData {
  courseName: string
  holeName: string
  holeNumber: number
  totalHoles: number
  par: number
  strokes: number
  totalStrokes: number
  totalPar: number
  mode: GameMode
  elapsed: number
  hazard: boolean
  trickText?: string
  trickDescription?: string
  hint?: string
}

interface HoleResultData {
  courseId: string
  courseName: string
  holeNumber: number
  totalHoles: number
  holeName: string
  strokes: number
  par: number
  stars: number
  label: string
  relative: number
  isBest: boolean
  previousBest: number | null
  totalStrokes: number
  totalPar: number
  mode: GameMode
  isLast: boolean
  single: boolean
  trick: { won: boolean; name: string; description: string } | null
  dailyBest?: number
  streak?: number
  courseCompleted: boolean
}

interface ScorecardData {
  course: CourseDefinition
  mode: GameMode
  results: { holeIndex: number; strokes: number; par: number; stars: number }[]
  totalStrokes: number
  totalPar: number
  starsEarned: number
  totalStars: number
  bestTotal: number | null
  elapsed: number
  bestTime: { timeMs: number; strokes: number } | null
  newRecord: boolean
  nextCourse: { id: string; name: string; unlocked: boolean; starsRequired: number } | null
  nextLocked: { id: string; name: string; starsRequired: number; missing: number } | null
  timeLabel: string
  courseCompleted: boolean
}

const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char)

const stars = (count: number): string =>
  `<span class="stars" aria-label="${count} of 3 stars">${[0, 1, 2].map((i) => `<i class="${i < count ? 'on' : ''}">★</i>`).join('')}</span>`

const MODE_LABEL: Record<GameMode, string> = {
  journey: 'Journey',
  free: 'Free Play',
  daily: 'Daily Challenge',
  timeattack: 'Time Attack',
  trick: 'Trick Shots',
  zen: 'Zen Mode',
}

const MODE_INTRO: Record<GameMode, string> = {
  journey: 'Play each garden in order and collect stars to open the next.',
  free: 'Replay any unlocked hole. Practice makes a lovely round.',
  daily: 'One seeded hole a day — the same hole for every golfer on earth.',
  timeattack: 'Nine holes against the clock. Fast and tidy wins.',
  trick: 'Six unusual challenges with one very specific finish.',
  zen: 'No pressure, full assists and all the time in the world.',
}

export class UI {
  private root: HTMLElement
  private screen: HTMLElement
  private hud: HTMLElement
  private toasts: HTMLElement
  private hudData: HudData | null = null
  private timer: number | null = null
  private hintTimer: number | null = null
  private confirmReset = false
  private clockBase = 0
  private clockSyncedAt = 0

  constructor(root: HTMLElement) {
    this.root = root
    this.root.innerHTML = ''
    this.screen = document.createElement('div')
    this.screen.className = 'screen screen--empty'
    this.hud = document.createElement('div')
    this.hud.className = 'hud'
    this.toasts = document.createElement('div')
    this.toasts.className = 'toasts'
    this.root.append(this.screen, this.hud, this.toasts)
    this.root.addEventListener('click', this.onClick)
    this.timer = window.setInterval(() => this.tick(), 500)
  }

  // -------------------------------------------------------------------------
  // Interaction plumbing
  // -------------------------------------------------------------------------

  private onClick = (event: Event): void => {
    const target = (event.target as HTMLElement | null)?.closest<HTMLElement>('[data-action]')
    if (!target) return
    const action = target.dataset.action
    if (!action) return

    if (target.dataset.setting) {
      audio.click()
      bus.emit('app:setting', { [target.dataset.setting]: target.dataset.value !== 'true' })
      return
    }

    if (action === 'app:resetProgress') {
      if (!this.confirmReset) {
        this.confirmReset = true
        target.classList.add('danger-armed')
        target.textContent = 'Tap again to erase everything'
        audio.fail()
        return
      }
      this.confirmReset = false
      audio.click()
      bus.emit(action)
      return
    }

    audio.click()
    bus.emit(action, {
      courseId: target.dataset.course,
      holeIndex: target.dataset.hole !== undefined ? Number(target.dataset.hole) : undefined,
      mode: target.dataset.mode,
      id: target.dataset.id,
    })
  }

  private tick(): void {
    const timerEl = this.hud.querySelector<HTMLElement>('[data-ref="timer"]')
    if (!timerEl || !this.hudData || this.hudData.mode !== 'timeattack') return
    timerEl.textContent = formatClock(this.clockBase + (Date.now() - this.clockSyncedAt))
  }

  private setScreen(html: string, className: string): void {
    this.screen.className = `screen ${className}`
    this.screen.innerHTML = html
    this.confirmReset = false
  }

  hidePanels(): void {
    this.screen.className = 'screen screen--empty'
    this.screen.innerHTML = ''
  }

  hideModals(): void {
    this.hidePanels()
  }

  // -------------------------------------------------------------------------
  // Menu
  // -------------------------------------------------------------------------

  showMenu(data: MenuData): void {
    const starsTotal = data.stars
    const bestCourse = COURSES.reduce((best, course) => {
      const earned = totalStarsOfCourse(data.save, course.id)
      return earned > best.earned ? { name: course.name, earned } : best
    }, { name: COURSES[0].name, earned: 0 })

    this.closeHud()
    this.setScreen(
      `
      <div class="menu">
        <div class="menu__brand">
          <p class="eyebrow">Little Joy Arcade presents</p>
          <h1 class="wordmark">Mini Golf <em>Garden</em></h1>
          <p class="lede">Seventy-two hand-built holes through eight whimsical gardens.</p>
        </div>

        <div class="menu__actions">
          <button class="btn btn--primary btn--wide" data-action="app:journey">
            <span class="btn__title">Journey</span>
            <span class="btn__sub">${data.save.stats.holesPlayed > 0 ? 'Continue your round of gardens' : 'Start in Sunny Meadows'}</span>
          </button>
          <button class="btn btn--wide" data-action="app:daily">
            <span class="btn__title">Daily Challenge</span>
            <span class="btn__sub">A new seeded hole every day</span>
          </button>
          <div class="menu__row">
            <button class="btn" data-action="app:freeplay"><span class="btn__title">Free Play</span></button>
            <button class="btn" data-action="app:tricks"><span class="btn__title">Trick Shots</span></button>
          </div>
          <div class="menu__row">
            <button class="btn" data-action="app:timeattack"><span class="btn__title">Time Attack</span></button>
            <button class="btn" data-action="app:zen"><span class="btn__title">Zen Mode</span></button>
          </div>
        </div>

        <div class="menu__meta">
          <div class="pill"><b>★ ${starsTotal}</b><span>of 216 stars</span></div>
          <div class="pill"><b>${data.save.achievements.length}/${data.totalAchievements}</b><span>achievements</span></div>
          <div class="pill"><b>${bestCourse.earned}</b><span>best garden</span></div>
        </div>

        ${
          data.nextLocked
            ? `<p class="next-unlock">Next garden: <b>${esc(data.nextLocked.name)}</b> — ${data.nextLocked.missing} more star${data.nextLocked.missing === 1 ? '' : 's'} to grow.</p>`
            : `<p class="next-unlock">Every garden is open. Go and win the Royal Garden.</p>`
        }

        <div class="menu__foot">
          <button class="link" data-action="app:howto">How to play</button>
          <span class="dot">·</span>
          <button class="link" data-action="app:settings">Settings</button>
          <span class="dot">·</span>
          <a class="link" href="https://littlejoyarcade.site" target="_blank" rel="noreferrer">littlejoyarcade.site</a>
        </div>
      </div>
    `,
      'screen--menu',
    )
  }

  // -------------------------------------------------------------------------
  // Course and hole select
  // -------------------------------------------------------------------------

  showCourses(data: CoursesData): void {
    const cards = COURSES.map((course, index) => {
      const progress = courseProgress(data.save, course.id)
      const earned = totalStarsOfCourse(data.save, course.id)
      const unlocked = isCourseUnlocked(data.save, course.id)
      const best = Object.keys(progress.best).length === course.holes.length
        ? Object.values(progress.best).reduce((sum, value) => sum + value, 0)
        : null
      const action = data.mode === 'free' || data.mode === 'zen' ? 'app:course' : 'app:play'
      return `
        <button class="course ${unlocked ? '' : 'course--locked'}"
          data-action="${unlocked ? action : 'app:locked'}"
          data-course="${course.id}"
          data-mode="${data.mode}"
          data-hole="0"
          style="--c1:${course.colors[0]};--c2:${course.colors[1]}"
          ${unlocked ? '' : 'aria-disabled="true"'}>
          <span class="course__num">${String(index + 1).padStart(2, '0')}</span>
          <span class="course__body">
            <span class="course__name">${esc(course.name)}</span>
            <span class="course__tag">${esc(course.tagline)}</span>
            <span class="course__meta">
              <span class="stars-mini">${'★'.repeat(Math.min(3, Math.round(earned / 9)))}${'☆'.repeat(3 - Math.min(3, Math.round(earned / 9)))}</span>
              <span>${earned}/27</span>
              ${best !== null ? `<span>best ${best}</span>` : ''}
            </span>
          </span>
          ${
            unlocked
              ? `<span class="course__go">Play →</span>`
              : `<span class="course__lock">🔒 ${course.starsRequired}</span>`
          }
        </button>
      `
    }).join('')

    this.setScreen(
      `
      <div class="page">
        <header class="page__head">
          <button class="btn btn--ghost" data-action="app:menu">← Menu</button>
          <div>
            <p class="eyebrow">${MODE_LABEL[data.mode]}</p>
            <h2>Choose a garden</h2>
            <p class="page__intro">${MODE_INTRO[data.mode]}</p>
          </div>
          <div class="page__stars">★ ${data.stars}</div>
        </header>
        <div class="course-grid">${cards}</div>
      </div>
    `,
      'screen--page',
    )
  }

  showHoles(data: HolesData): void {
    const course = getCourse(data.courseId)
    if (!course) return
    const progress = courseProgress(data.save, course.id)
    const chips = course.holes
      .map((hole, index) => {
        const best = progress.best[index]
        const earned = progress.stars[index] ?? 0
        return `
          <button class="hole-chip" data-action="app:play" data-course="${course.id}" data-mode="${data.mode}" data-hole="${index}">
            <span class="hole-chip__num">${index + 1}</span>
            <span class="hole-chip__name">${esc(hole.name)}</span>
            <span class="hole-chip__meta">Par ${hole.par}${best !== undefined ? ` · best ${best}` : ''}</span>
            ${stars(earned)}
          </button>
        `
      })
      .join('')

    this.setScreen(
      `
      <div class="page">
        <header class="page__head">
          <button class="btn btn--ghost" data-action="app:courses">← Gardens</button>
          <div>
            <p class="eyebrow">${MODE_LABEL[data.mode]}</p>
            <h2>${esc(course.name)}</h2>
            <p class="page__intro">${esc(course.tagline)}</p>
          </div>
          <div class="page__stars">★ ${totalStarsOfCourse(data.save, course.id)}/27</div>
        </header>
        <div class="hole-grid">${chips}</div>
      </div>
    `,
      'screen--page',
    )
  }

  // -------------------------------------------------------------------------
  // HUD
  // -------------------------------------------------------------------------

  updateHud(data: HudData): void {
    this.hudData = data
    this.clockBase = data.elapsed
    this.clockSyncedAt = Date.now()
    if (!this.hud.classList.contains('hud--on')) {
      this.hud.className = 'hud hud--on'
      this.hud.innerHTML = `
        <div class="hud__top">
          <div class="hud__where">
            <span class="hud__course" data-ref="course"></span>
            <span class="hud__hole" data-ref="hole"></span>
          </div>
          <div class="hud__score">
            <span class="hud__strokes" data-ref="strokes">0</span>
            <span class="hud__par" data-ref="par"></span>
            <span class="hud__timer" data-ref="timer"></span>
          </div>
          <div class="hud__actions">
            <span class="hud__total" data-ref="total"></span>
            <button class="icon-btn" data-action="app:pause" aria-label="Pause">❚❚</button>
          </div>
        </div>
        <div class="hud__trick" data-ref="trick" hidden></div>
        <div class="hud__toast" data-ref="hint"></div>
        <div class="hud__tip" data-ref="tip">Drag back from the ball to aim · release to putt</div>
      `
    }

    this.setText('course', data.courseName)
    this.setText('hole', `Hole ${data.holeNumber} of ${data.totalHoles} · ${data.holeName}`)
    this.setText('strokes', String(data.strokes))
    this.setText('par', `Par ${data.par}`)
    this.setText('total', data.totalStrokes > 0 ? `Round ${data.totalStrokes} stroke${data.totalStrokes === 1 ? '' : 's'}` : 'Round starts')

    const timer = this.hud.querySelector<HTMLElement>('[data-ref="timer"]')
    if (timer) {
      timer.hidden = data.mode !== 'timeattack'
      if (data.mode === 'timeattack') timer.textContent = formatClock(data.elapsed)
    }

    const trick = this.hud.querySelector<HTMLElement>('[data-ref="trick"]')
    if (trick) {
      trick.hidden = !data.trickText
      if (data.trickText) {
        trick.innerHTML = `<b>Trick shot</b> · ${esc(data.trickDescription ?? '')} <span>${esc(data.trickText)}</span>`
      }
    }

    const tip = this.hud.querySelector<HTMLElement>('[data-ref="tip"]')
    if (tip) {
      if (data.hint) {
        tip.textContent = data.hint
        tip.classList.add('hud__tip--hint')
      } else {
        tip.classList.remove('hud__tip--hint')
        tip.textContent = 'Drag back from the ball to aim · release to putt'
      }
    }

    const hint = this.hud.querySelector<HTMLElement>('[data-ref="hint"]')
    if (hint && data.hazard) {
      hint.textContent = 'Splash! One-stroke penalty — replaying from your last lie.'
      hint.classList.add('hud__toast--on')
      window.setTimeout(() => hint.classList.remove('hud__toast--on'), 2200)
    }
    if (hint && data.strokes === 1 && !hint.classList.contains('hud__toast--on')) {
      hint.textContent = ''
    }

    this.hud.classList.toggle('hud--hazard', Boolean(data.hazard))
    // Restart the fade timer whenever a new hint appears.
    if (data.hint && this.hintTimer === null) {
      this.hintTimer = window.setTimeout(() => {
        this.hintTimer = null
      }, 7000)
    }
  }

  private setText(ref: string, value: string): void {
    const element = this.hud.querySelector<HTMLElement>(`[data-ref="${ref}"]`)
    if (element && element.textContent !== value) element.textContent = value
  }

  private closeHud(): void {
    this.hud.className = 'hud'
    this.hud.innerHTML = ''
    this.hudData = null
  }

  // -------------------------------------------------------------------------
  // Results
  // -------------------------------------------------------------------------

  showHoleResult(data: HoleResultData): void {
    const starRow = stars(data.stars)
    const primary = data.isLast ? (data.single ? 'app:menu' : 'app:finishRound') : 'app:next'
    const primaryLabel = data.isLast ? (data.single ? 'Back to the garden' : 'See the scorecard') : 'Next hole →'
    const dailyBlock =
      data.mode === 'daily' && data.dailyBest !== undefined
        ? `<p class="result__meta">Today's best: <b>${data.dailyBest}</b> · streak ${data.streak ?? 0}</p>`
        : ''
    const trickBlock = data.trick
      ? `<div class="trick-result ${data.trick.won ? 'trick-result--won' : ''}">
           <b>${data.trick.won ? 'Trick shot complete' : 'Trick shot missed'}</b>
           <span>${esc(data.trick.description)}</span>
         </div>`
      : ''

    this.setScreen(
      `
      <div class="modal">
        <div class="card card--result">
          <p class="eyebrow">${esc(data.courseName)} · hole ${data.holeNumber} of ${data.totalHoles}</p>
          <h2 class="result__label">${esc(data.label)}</h2>
          <div class="result__stars">${starRow}</div>
          <div class="result__numbers">
            <div><b>${data.strokes}</b><span>strokes</span></div>
            <div><b>${data.par}</b><span>par</span></div>
            <div><b>${data.relative === 0 ? 'E' : data.relative > 0 ? `+${data.relative}` : data.relative}</b><span>to par</span></div>
          </div>
          ${data.isBest ? `<p class="badge badge--best">New personal best${data.previousBest !== null ? ` (was ${data.previousBest})` : ''}</p>` : ''}
          ${trickBlock}
          ${dailyBlock}
          <p class="result__meta">Round so far: ${relativeTotal(data.totalStrokes, data.totalPar)} through ${data.holeNumber} hole${data.holeNumber === 1 ? '' : 's'}</p>
          <div class="card__actions">
            <button class="btn btn--primary" data-action="${primary}">${primaryLabel}</button>
            ${data.mode === 'daily' ? '' : '<button class="btn" data-action="app:retryHole">Replay the hole</button>'}
            <button class="btn btn--ghost" data-action="app:menu">Menu</button>
          </div>
        </div>
      </div>
    `,
      'screen--modal',
    )
  }

  showScorecard(data: ScorecardData): void {
    const rows = data.course.holes
      .map((hole, index) => {
        const result = data.results.find((entry) => entry.holeIndex === index)
        const strokes = result?.strokes ?? '—'
        const relative = result ? result.strokes - hole.par : 0
        const diff = result ? (relative === 0 ? 'E' : relative > 0 ? `+${relative}` : String(relative)) : '—'
        return `<tr>
          <td>${index + 1}</td>
          <td class="left">${esc(hole.name)}</td>
          <td>${hole.par}</td>
          <td>${strokes}</td>
          <td class="${relative < 0 ? 'under' : relative > 0 ? 'over' : ''}">${diff}</td>
          <td>${stars(result?.stars ?? 0)}</td>
        </tr>`
      })
      .join('')

    const next = data.nextCourse
    const nextBlock = next
      ? next.unlocked
        ? `<button class="btn btn--primary" data-action="app:play" data-course="${next.id}" data-mode="journey" data-hole="0">Next garden: ${esc(next.name)}</button>`
        : `<p class="unlock-note">${esc(next.name)} needs ${data.nextLocked?.missing ?? next.starsRequired} more stars.</p>`
      : `<button class="btn btn--primary" data-action="app:menu">Back to the garden</button>`

    this.setScreen(
      `
      <div class="modal modal--scroll">
        <div class="card card--wide">
          <p class="eyebrow">${MODE_LABEL[data.mode]} · ${esc(data.course.name)}</p>
          <h2>${data.courseCompleted ? 'Garden complete' : 'Round complete'}</h2>
          <div class="score-hero">
            <div><b>${data.totalStrokes}</b><span>strokes</span></div>
            <div><b>${data.totalPar}</b><span>par</span></div>
            <div><b>${relativeTotal(data.totalStrokes, data.totalPar)}</b><span>total</span></div>
            <div><b>${data.starsEarned}</b><span>stars won</span></div>
          </div>
          ${data.mode === 'timeattack' ? `<p class="result__meta">Time: <b>${data.timeLabel}</b>${data.newRecord ? ' · new record!' : ''}${data.bestTime ? ` · best ${formatClock(data.bestTime.timeMs)}` : ''}</p>` : ''}
          <div class="scorecard">
            <table>
              <thead><tr><th>#</th><th class="left">Hole</th><th>Par</th><th>Score</th><th>+/-</th><th>★</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <p class="rating">${esc(starsToRating(data.starsEarned, data.course.holes.length * 3))} · ${data.totalStars} stars collected in total</p>
          <div class="card__actions">
            ${nextBlock}
            <button class="btn" data-action="app:play" data-course="${data.course.id}" data-mode="${data.mode}" data-hole="0">Replay this garden</button>
            <button class="btn btn--ghost" data-action="app:menu">Menu</button>
          </div>
        </div>
      </div>
    `,
      'screen--modal',
    )
  }

  // -------------------------------------------------------------------------
  // Daily, tricks, settings, how-to, pause
  // -------------------------------------------------------------------------

  showDaily(data: { save: SaveData; selection: DailySelection; best?: number; playedToday: boolean }): void {
    const course = getCourse(data.selection.courseId)
    const hole = getHole(data.selection.courseId, data.selection.holeIndex)
    this.setScreen(
      `
      <div class="modal">
        <div class="card">
          <p class="eyebrow">Daily challenge · ${esc(data.selection.key)}</p>
          <h2>Today's hole</h2>
          <p class="result__meta">${esc(dailyHoleName(data.selection))}${hole ? ` · Par ${hole.par}` : ''}</p>
          <p class="daily-twist">“${esc(data.selection.twist)}”</p>
          <div class="score-hero score-hero--small">
            <div><b>${data.best ?? '—'}</b><span>your best</span></div>
            <div><b>${data.save.daily.streak}</b><span>day streak</span></div>
            <div><b>${data.save.daily.played}</b><span>played</span></div>
          </div>
          <p class="result__meta">Every player gets this same hole today. One attempt is enough — but the garden is patient.</p>
          <div class="card__actions">
            <button class="btn btn--primary" data-action="app:dailyPlay">${data.playedToday ? 'Play again' : 'Play today\'s hole'}</button>
            <button class="btn btn--ghost" data-action="app:menu">Menu</button>
          </div>
          <p class="fineprint">${course ? esc(course.name) : ''}</p>
        </div>
      </div>
    `,
      'screen--modal',
    )
  }

  showTricks(data: { save: SaveData; shots: TrickShot[] }): void {
    const items = data.shots
      .map((shot) => {
        const course = getCourse(shot.courseId)
        const done = Boolean(data.save.trickShots[shot.id])
        return `
        <div class="trick ${done ? 'trick--done' : ''}">
          <div class="trick__head">
            <h3>${esc(shot.name)}</h3>
            <span class="trick__done">${done ? '✓ cleared' : ''}</span>
          </div>
          <p>${esc(shot.description)}</p>
          <p class="trick__where">${esc(course?.name ?? '')} · hole ${shot.holeIndex + 1}</p>
          <button class="btn ${done ? '' : 'btn--primary'}" data-action="app:trick" data-id="${shot.id}">${done ? 'Play again' : 'Try it'}</button>
        </div>
      `
      })
      .join('')

    this.setScreen(
      `
      <div class="page">
        <header class="page__head">
          <button class="btn btn--ghost" data-action="app:menu">← Menu</button>
          <div>
            <p class="eyebrow">Trick Shots</p>
            <h2>One very specific finish</h2>
            <p class="page__intro">Each challenge reuses a hand-built hole and asks for something unusual.</p>
          </div>
          <div class="page__stars">${
            Object.keys(data.save.trickShots).filter((id) => data.shots.some((shot) => shot.id === id)).length
          }/${data.shots.length}</div>
        </header>
        <div class="trick-grid">${items}</div>
      </div>
    `,
      'screen--page',
    )
  }

  showSettings(data: { save: SaveData }): void {
    const { settings } = data.save
    const toggle = (key: keyof Settings, label: string, description: string): string => `
      <button class="setting ${settings[key] ? 'setting--on' : ''}" data-action="app:setting" data-setting="${key}" data-value="${settings[key]}">
        <span class="setting__body"><b>${label}</b><span>${description}</span></span>
        <span class="switch"><i></i></span>
      </button>
    `

    this.setScreen(
      `
      <div class="modal">
        <div class="card">
          <p class="eyebrow">Settings</p>
          <h2>Make it yours</h2>
          <div class="settings">
            ${toggle('sound', 'Sound effects', 'Putts, bounces, splashes and little cheers.')}
            ${toggle('ambience', 'Garden ambience', 'Birdsong between shots.')}
            ${toggle('assist', 'Trajectory assist', 'Dotted preview of where the ball will roll.')}
            ${toggle('shake', 'Screen shake', 'A small rumble on hard impacts.')}
            ${toggle('haptics', 'Haptics', 'Gentle vibration on supported phones.')}
          </div>
          <div class="card__actions">
            <button class="btn btn--ghost" data-action="app:settingsBack">Back</button>
            <button class="btn btn--danger" data-action="app:resetProgress">Reset progress</button>
          </div>
          <p class="fineprint">Progress saves in this browser and syncs to your Little Joy account when signed in.</p>
        </div>
      </div>
    `,
    'screen--modal',
    )
  }

  showHowTo(): void {
    this.setScreen(
      `
      <div class="modal modal--scroll">
        <div class="card">
          <p class="eyebrow">How to play</p>
          <h2>A very small golf lesson</h2>
          <ol class="howto">
            <li><b>Pull back.</b> Press near the ball, drag away from the direction you want, and release. The further you pull, the harder the putt.</li>
            <li><b>Read the garden.</b> Stone and ice let the ball run; sand and mud grab it; water costs a stroke and puts you back on your last lie.</li>
            <li><b>Use the obstacles.</b> Mushrooms kick, windmills sweep, gates breathe open and shut, winds push, flowers teleport.</li>
            <li><b>Keep it tidy.</b> Par or better earns three stars. Two stars at one over par, one star for finishing.</li>
          </ol>
          <p class="result__meta">Desktop: drag with the mouse, or use ← → to aim, ↑ ↓ for power and Space to putt. R restarts the hole, Esc pauses.</p>
          <p class="result__meta">Phone: drag anywhere and release. Playing in landscape gives you a much bigger garden.</p>
          <div class="card__actions">
            <button class="btn btn--primary" data-action="app:menu">Let's play</button>
          </div>
        </div>
      </div>
    `,
    'screen--modal',
    )
  }

  showPause(data: { save: SaveData; mode: GameMode }): void {
    this.setScreen(
      `
      <div class="modal">
        <div class="card">
          <p class="eyebrow">Paused</p>
          <h2>Take a breath</h2>
          <p class="result__meta">${MODE_LABEL[data.mode]} · the ball is exactly where you left it.</p>
          <div class="card__actions">
            <button class="btn btn--primary" data-action="app:resume">Resume</button>
            <button class="btn" data-action="app:restartHole">Restart this hole</button>
            <button class="btn" data-action="app:settings">Settings</button>
            <button class="btn btn--ghost" data-action="app:menu">Quit to menu</button>
          </div>
        </div>
      </div>
    `,
    'screen--modal',
    )
  }

  // -------------------------------------------------------------------------
  // Toasts
  // -------------------------------------------------------------------------

  toast(data: { title: string; text?: string; kind?: string }): void {
    const element = document.createElement('div')
    element.className = `toast toast--${data.kind ?? 'info'}`
    element.innerHTML = `<b>${esc(data.title)}</b>${data.text ? `<span>${esc(data.text)}</span>` : ''}`
    this.toasts.appendChild(element)
    window.setTimeout(() => element.classList.add('toast--out'), 3600)
    window.setTimeout(() => element.remove(), 4300)
  }

  dispose(): void {
    if (this.timer !== null) window.clearInterval(this.timer)
    if (this.hintTimer !== null) window.clearTimeout(this.hintTimer)
    this.root.removeEventListener('click', this.onClick)
  }
}

function totalStarsOfCourse(save: SaveData, courseId: string): number {
  const progress = courseProgress(save, courseId)
  return Object.values(progress.stars).reduce((sum, value) => sum + value, 0)
}

export { totalStars, totalPar }
