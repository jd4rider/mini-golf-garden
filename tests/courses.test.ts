import { describe, expect, it } from 'vitest'
import { COURSES, TOTAL_HOLES, getCourse } from '../src/core/courses'
import { courseReport, validateCourses } from '../src/core/validator'

describe('course catalogue', () => {
  it('ships eight courses of nine holes (72 in total)', () => {
    expect(COURSES).toHaveLength(8)
    expect(TOTAL_HOLES).toBe(72)
    for (const course of COURSES) expect(course.holes).toHaveLength(9)
  })

  it('has unique ids and hole names', () => {
    const ids = COURSES.map((course) => course.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const course of COURSES) {
      const names = course.holes.map((hole) => hole.name)
      expect(new Set(names).size).toBe(names.length)
    }
  })

  it('uses a rising star requirement ladder', () => {
    const thresholds = COURSES.map((course) => course.starsRequired)
    expect(thresholds[0]).toBe(0)
    for (let i = 1; i < thresholds.length; i += 1) {
      expect(thresholds[i]).toBeGreaterThan(thresholds[i - 1])
      // Every threshold must be reachable from the previous courses (27 stars each).
      expect(thresholds[i]).toBeLessThanOrEqual(27 * i)
    }
  })

  it('has pars that suit the course position', () => {
    const total = COURSES.flatMap((course) => course.holes).reduce((sum, hole) => sum + hole.par, 0)
    expect(total).toBeGreaterThan(240)
    expect(total).toBeLessThan(300)
    for (const course of COURSES) {
      const par = course.holes.reduce((sum, hole) => sum + hole.par, 0)
      expect(par).toBeGreaterThanOrEqual(27)
      expect(par).toBeLessThanOrEqual(40)
    }
  })
})

describe('every hole validates', () => {
  it('has no structural errors anywhere', () => {
    const reports = validateCourses()
    const failures = reports
      .filter((report) => report.errors.length > 0)
      .map((report) => `${report.courseName} ${report.holeIndex + 1} ${report.holeName}: ${report.errors.join('; ')}`)
    expect(failures).toEqual([])
  })

  it('has a tee-to-cup route on every hole', () => {
    const reports = validateCourses()
    for (const report of reports) {
      expect(report.errors.join(' ')).not.toContain('walking route')
    }
  })

  it('never boxes the ball in on the tee', () => {
    const reports = validateCourses()
    const trapped = reports.filter((report) => !report.escaped)
    expect(trapped.map((report) => `${report.courseName} ${report.holeIndex + 1}`)).toEqual([])
  })

  it('keeps every tee putt inside the garden', () => {
    for (const report of validateCourses()) {
      expect(report.errors).toEqual([])
      expect(report.closestApproach).toBeLessThan(40)
    }
  })
})

describe('course report helper', () => {
  it('returns nine reports for a known course and none for an unknown one', () => {
    expect(courseReport('sunny-meadows')).toHaveLength(9)
    expect(courseReport('not-a-course')).toEqual([])
    expect(getCourse('lily-pond')?.name).toBe('Lily Pond')
  })
})
