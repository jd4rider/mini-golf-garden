/**
 * Course health report.
 *
 *   npx vite-node scripts/report.ts
 *
 * Prints every problem the validator finds, plus a per-course summary. This is
 * the tool to run after editing a hole.
 */
import { COURSES } from '../src/core/courses'
import { validateCourses } from '../src/core/validator'

const reports = validateCourses()

for (const report of reports) {
  if (!report.errors.length && !report.warnings.length) continue
  const label = `${report.courseName} · ${report.holeIndex + 1} ${report.holeName}`
  for (const error of report.errors) console.log(`ERROR ${label}: ${error}`)
  for (const warning of report.warnings) console.log(`WARN  ${label}: ${warning}`)
}

console.log('')
console.log('Course                 Par  Holes  Errors  Warnings  Clean-putt')
for (const course of COURSES) {
  const own = reports.filter((report) => report.courseId === course.id)
  const par = course.holes.reduce((sum, hole) => sum + hole.par, 0)
  const errors = own.reduce((sum, report) => sum + report.errors.length, 0)
  const warnings = own.reduce((sum, report) => sum + report.warnings.length, 0)
  const clean = own.filter((report) => report.directPutt).length
  console.log(
    `${course.name.padEnd(22)} ${String(par).padStart(3)}  ${String(own.length).padStart(5)}  ${String(errors).padStart(6)}  ${String(warnings).padStart(8)}  ${String(clean).padStart(10)}`,
  )
}

const totalErrors = reports.reduce((sum, report) => sum + report.errors.length, 0)
const totalWarnings = reports.reduce((sum, report) => sum + report.warnings.length, 0)
console.log('')
console.log(`Holes: ${reports.length}  Errors: ${totalErrors}  Warnings: ${totalWarnings}`)
console.log(`Straight-putt holes: ${reports.filter((report) => report.directPutt).length}`)

if (totalErrors > 0) process.exitCode = 1
