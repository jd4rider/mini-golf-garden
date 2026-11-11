import { COURSES, getCourse } from './courses'
import { hashString, rng } from './math'

/** UTC date key, e.g. 2026-11-02. Everyone in the world gets the same hole. */
export function dailyKey(date = new Date()): string {
  return date.toISOString().slice(0, 10)
}

export function yesterdayKey(date = new Date()): string {
  const copy = new Date(date.getTime())
  copy.setUTCDate(copy.getUTCDate() - 1)
  return dailyKey(copy)
}

export interface DailySelection {
  key: string
  courseId: string
  holeIndex: number
  /** Extra rule for the day, purely cosmetic flavour. */
  twist: string
}

const TWISTS = [
  'One attempt at the pin — make it count.',
  'The garden is quiet today. Take your time.',
  'A single putt earns the golden flag.',
  'Read the slope twice, swing once.',
  'Bonus glory for a hole in one.',
]

/** Deterministic hole for a date. Same input, same hole, everywhere. */
export function dailySelection(date = new Date()): DailySelection {
  const key = dailyKey(date)
  const random = rng(hashString(`mini-golf-garden:${key}`))
  const pool: { courseId: string; holeIndex: number }[] = []
  for (const course of COURSES) {
    course.holes.forEach((_hole, holeIndex) => pool.push({ courseId: course.id, holeIndex }))
  }
  const choice = pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))]
  const twist = TWISTS[Math.floor(random() * TWISTS.length)]
  return { key, ...choice, twist }
}

export function dailyHoleName(selection: DailySelection): string {
  const course = getCourse(selection.courseId)
  return course ? `${course.name} · Hole ${selection.holeIndex + 1}` : 'Daily hole'
}

/** Streak maths: play today or lose it; yesterday keeps the chain alive. */
export function updateDailyStreak(
  daily: { streak: number; lastPlayed: string },
  today = dailyKey(),
): boolean {
  if (daily.lastPlayed === today) return false
  const previous = yesterdayKey(new Date(`${today}T00:00:00Z`))
  daily.streak = daily.lastPlayed === previous ? daily.streak + 1 : 1
  daily.lastPlayed = today
  return true
}

export { dailyKey as todayKey }
