import { COURSES, getCourse, getHole } from './courses'
import { countStars, starsForHole } from './scoring'
import type { GameMode } from './types'

export const SAVE_KEY = 'mini-golf-garden-save-v1'
export const SAVE_VERSION = 1

export interface Settings {
  sound: boolean
  ambience: boolean
  assist: boolean
  shake: boolean
  haptics: boolean
}

export interface CourseProgress {
  /** holeIndex -> best strokes */
  best: Record<string, number>
  /** holeIndex -> stars earned */
  stars: Record<string, number>
  /** Number of holes finished at least once. */
  completed: number
}

export interface AchievementDefinition {
  id: string
  name: string
  description: string
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { id: 'first_swing', name: 'First Swing', description: 'Take your first putt in the garden.' },
  { id: 'first_birdie', name: 'Little Birdie', description: 'Finish a hole under par.' },
  { id: 'hole_in_one', name: 'Ace of Gardens', description: 'Sink a hole in one.' },
  { id: 'meadow_clear', name: 'Meadow Wanderer', description: 'Complete every hole in Sunny Meadows.' },
  { id: 'grove_clear', name: 'Fungi Friend', description: 'Complete every hole in Mushroom Grove.' },
  { id: 'pond_clear', name: 'Pond Skipper', description: 'Complete every hole in Lily Pond.' },
  { id: 'windmill_clear', name: 'Windbreaker', description: 'Complete every hole in Windmill Valley.' },
  { id: 'crystal_clear', name: 'Crystal Clear', description: 'Complete every hole in Crystal Garden.' },
  { id: 'orchard_clear', name: 'Harvest Hands', description: 'Complete every hole in Autumn Orchard.' },
  { id: 'moonlight_clear', name: 'Moonlit Putt', description: 'Complete every hole in Moonlight Garden.' },
  { id: 'royal_clear', name: 'Royal Appointment', description: 'Complete every hole in Royal Garden.' },
  { id: 'all_par', name: 'Above Par', description: 'Finish any course at par or better.' },
  { id: 'star_collector', name: 'Star Collector', description: 'Earn 60 stars in total.' },
  { id: 'daily_three', name: 'Daily Ritual', description: 'Play three daily challenges.' },
  { id: 'trickster', name: 'Trickster', description: 'Clear a trick shot challenge.' },
]

export interface SaveData {
  version: number
  updatedAt: number
  settings: Settings
  courses: Record<string, CourseProgress>
  achievements: string[]
  daily: { best: Record<string, number>; streak: number; lastPlayed: string; played: number }
  timeAttack: Record<string, { timeMs: number; strokes: number }>
  trickShots: Record<string, boolean>
  stats: { strokes: number; holesPlayed: number; holesInOne: number; rounds: number }
}

export function defaultSettings(): Settings {
  return { sound: true, ambience: true, assist: true, shake: true, haptics: true }
}

export function createSave(): SaveData {
  const courses: Record<string, CourseProgress> = {}
  for (const course of COURSES) {
    courses[course.id] = { best: {}, stars: {}, completed: 0 }
  }
  return {
    version: SAVE_VERSION,
    updatedAt: Date.now(),
    settings: defaultSettings(),
    courses,
    achievements: [],
    daily: { best: {}, streak: 0, lastPlayed: '', played: 0 },
    timeAttack: {},
    trickShots: {},
    stats: { strokes: 0, holesPlayed: 0, holesInOne: 0, rounds: 0 },
  }
}

/** Merge any older/partial payload into a complete save — never throws. */
export function migrateSave(raw: unknown): SaveData {
  const base = createSave()
  if (!raw || typeof raw !== 'object') return base
  const input = raw as Partial<SaveData>

  if (input.settings && typeof input.settings === 'object') {
    base.settings = { ...base.settings, ...input.settings }
  }
  if (input.courses && typeof input.courses === 'object') {
    for (const course of COURSES) {
      const saved = input.courses[course.id]
      if (!saved || typeof saved !== 'object') continue
      const best: Record<string, number> = {}
      const stars: Record<string, number> = {}
      for (let i = 0; i < course.holes.length; i += 1) {
        const b = Number(saved.best?.[i])
        const s = Number(saved.stars?.[i])
        if (Number.isFinite(b) && b > 0) best[i] = Math.min(99, Math.round(b))
        if (Number.isFinite(s) && s > 0) stars[i] = Math.max(0, Math.min(3, Math.round(s)))
      }
      base.courses[course.id] = { best, stars, completed: Object.keys(best).length }
    }
  }
  if (Array.isArray(input.achievements)) {
    base.achievements = [...new Set(input.achievements.filter((id) => typeof id === 'string'))]
  }
  if (input.daily && typeof input.daily === 'object') {
    base.daily = {
      best: {},
      streak: Math.max(0, Math.round(Number(input.daily.streak) || 0)),
      lastPlayed: typeof input.daily.lastPlayed === 'string' ? input.daily.lastPlayed : '',
      played: Math.max(0, Math.round(Number(input.daily.played) || 0)),
    }
    if (input.daily.best && typeof input.daily.best === 'object') {
      for (const [key, value] of Object.entries(input.daily.best)) {
        const n = Number(value)
        if (key.length <= 10 && Number.isFinite(n) && n > 0) base.daily.best[key] = Math.round(n)
      }
    }
  }
  if (input.timeAttack && typeof input.timeAttack === 'object') {
    for (const [key, value] of Object.entries(input.timeAttack)) {
      if (!getCourse(key) || !value) continue
      const timeMs = Number(value.timeMs)
      const strokes = Number(value.strokes)
      if (Number.isFinite(timeMs) && timeMs > 0) {
        base.timeAttack[key] = { timeMs, strokes: Number.isFinite(strokes) ? strokes : 0 }
      }
    }
  }
  if (input.trickShots && typeof input.trickShots === 'object') {
    for (const [key, value] of Object.entries(input.trickShots)) {
      if (value) base.trickShots[key] = true
    }
  }
  if (input.stats && typeof input.stats === 'object') {
    base.stats = {
      strokes: Math.max(0, Math.round(Number(input.stats.strokes) || 0)),
      holesPlayed: Math.max(0, Math.round(Number(input.stats.holesPlayed) || 0)),
      holesInOne: Math.max(0, Math.round(Number(input.stats.holesInOne) || 0)),
      rounds: Math.max(0, Math.round(Number(input.stats.rounds) || 0)),
    }
  }
  base.updatedAt = Date.now()
  return base
}

let storageAvailable: boolean | null = null

function storage(): Storage | null {
  if (storageAvailable === false) return null
  try {
    const test = '__mg_test__'
    window.localStorage.setItem(test, '1')
    window.localStorage.removeItem(test)
    storageAvailable = true
    return window.localStorage
  } catch {
    storageAvailable = false
    return null
  }
}

export function loadSave(): SaveData {
  const store = storage()
  if (!store) return createSave()
  try {
    const raw = store.getItem(SAVE_KEY)
    if (!raw) return createSave()
    return migrateSave(JSON.parse(raw))
  } catch {
    return createSave()
  }
}

export function writeSave(save: SaveData): void {
  save.updatedAt = Date.now()
  const store = storage()
  if (!store) return
  try {
    store.setItem(SAVE_KEY, JSON.stringify(save))
  } catch {
    /* private mode or quota: the session still works in memory */
  }
}

export function courseProgress(save: SaveData, courseId: string): CourseProgress {
  const course = getCourse(courseId)
  if (!course) return { best: {}, stars: {}, completed: 0 }
  if (!save.courses[courseId]) save.courses[courseId] = { best: {}, stars: {}, completed: 0 }
  return save.courses[courseId]
}

export function totalStars(save: SaveData): number {
  let total = 0
  for (const course of COURSES) total += countStars(courseProgress(save, course.id).stars)
  return total
}

export function isCourseUnlocked(save: SaveData, courseId: string): boolean {
  const course = getCourse(courseId)
  if (!course) return false
  if (course.starsRequired <= 0) return true
  return totalStars(save) >= course.starsRequired
}

export function nextLockedCourse(save: SaveData): { id: string; name: string; starsRequired: number; missing: number } | null {
  for (const course of COURSES) {
    if (isCourseUnlocked(save, course.id)) continue
    return {
      id: course.id,
      name: course.name,
      starsRequired: course.starsRequired,
      missing: course.starsRequired - totalStars(save),
    }
  }
  return null
}

export interface HoleRecordResult {
  stars: number
  previousBest: number | null
  isBest: boolean
  newAchievements: AchievementDefinition[]
  courseJustCompleted: boolean
}

export function recordHole(
  save: SaveData,
  courseId: string,
  holeIndex: number,
  strokes: number,
  mode: GameMode,
): HoleRecordResult {
  const course = getCourse(courseId)
  const hole = getHole(courseId, holeIndex)
  const progress = courseProgress(save, courseId)
  const stars = hole ? starsForHole(hole, strokes) : 1
  const previousBest = progress.best[holeIndex] ?? null
  const isBest = previousBest === null || strokes < previousBest

  if (isBest) progress.best[holeIndex] = strokes
  if ((progress.stars[holeIndex] ?? 0) < stars) progress.stars[holeIndex] = stars
  progress.completed = Object.keys(progress.best).length

  save.stats.strokes += strokes
  save.stats.holesPlayed += 1
  if (strokes === 1) save.stats.holesInOne += 1

  const newAchievements: AchievementDefinition[] = []
  const unlock = (id: string): void => {
    if (save.achievements.includes(id)) return
    const definition = ACHIEVEMENTS.find((entry) => entry.id === id)
    if (!definition) return
    save.achievements.push(id)
    newAchievements.push(definition)
  }

  unlock('first_swing')
  if (hole && strokes < hole.par) unlock('first_birdie')
  if (strokes === 1) unlock('hole_in_one')

  const clearAchievement: Record<string, string> = {
    'sunny-meadows': 'meadow_clear',
    'mushroom-grove': 'grove_clear',
    'lily-pond': 'pond_clear',
    'windmill-valley': 'windmill_clear',
    'crystal-garden': 'crystal_clear',
    'autumn-orchard': 'orchard_clear',
    'moonlight-garden': 'moonlight_clear',
    'royal-garden': 'royal_clear',
  }

  const wasComplete = progress.completed >= (course?.holes.length ?? 9)
  if (wasComplete && clearAchievement[courseId]) unlock(clearAchievement[courseId])
  if (totalStars(save) >= 60) unlock('star_collector')

  if (mode === 'daily') {
    save.daily.played += 1
    if (save.daily.played >= 3) unlock('daily_three')
  }

  return {
    stars,
    previousBest,
    isBest,
    newAchievements,
    courseJustCompleted: !wasComplete && progress.completed >= (course?.holes.length ?? 9),
  }
}

export function awardAchievement(save: SaveData, id: string): AchievementDefinition | null {
  if (save.achievements.includes(id)) return null
  const definition = ACHIEVEMENTS.find((entry) => entry.id === id)
  if (!definition) return null
  save.achievements.push(id)
  return definition
}

export function courseBestTotal(save: SaveData, courseId: string): number | null {
  const course = getCourse(courseId)
  if (!course) return null
  const progress = courseProgress(save, courseId)
  let total = 0
  for (let i = 0; i < course.holes.length; i += 1) {
    const best = progress.best[i]
    if (best === undefined) return null
    total += best
  }
  return total
}

export function resetProgress(save: SaveData): SaveData {
  const fresh = createSave()
  fresh.settings = { ...save.settings }
  return fresh
}
