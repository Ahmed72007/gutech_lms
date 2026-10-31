import type { z } from 'zod'
import * as accessRepository from '../repositories/access.repository.js'
import * as auditRepository from '../repositories/audit.repository.js'
import * as courseRepository from '../repositories/course.repository.js'
import * as profileRepository from '../repositories/profile.repository.js'
import type { createCourseSchema, listCoursesQuery, rosterQuery, updateCourseSchema } from '../schemas/course.schema.js'
import type { Profile, RequestContext } from '../types/domain.js'
import { parseEmailList } from '../utils/csv.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { getCourseAccess, assertCanView } from './access.service.js'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function listCourses(query: z.infer<typeof listCoursesQuery>) {
  const { rows, total } = await courseRepository.list({ search: query.search, archived: query.archived }, query)
  return { data: rows, meta: pageMeta(query, total) }
}

export async function getCourseForAdmin(courseId: string) {
  const course = await courseRepository.findById(courseId)
  if (!course) throw errors.notFound('Course not found.')
  return course
}

export async function createCourse(actor: Profile, input: z.infer<typeof createCourseSchema>) {
  const course = await courseRepository.insert(input)
  await auditRepository.record(actor.id, 'course.create', 'course', course.id)
  return course
}

export async function updateCourse(actor: Profile, courseId: string, input: z.infer<typeof updateCourseSchema>) {
  const course = await courseRepository.update(courseId, input)
  if (!course) throw errors.notFound('Course not found.')
  const action = input.isArchived === true ? 'course.archive' : input.isArchived === false ? 'course.unarchive' : 'course.update'
  await auditRepository.record(actor.id, action, 'course', courseId)
  return course
}

export async function setTeachers(actor: Profile, courseId: string, teacherIds: string[]) {
  await getCourseForAdmin(courseId)
  if (teacherIds.length > 0) {
    const people = await profileRepository.findSummaries({ ids: teacherIds })
    const valid = new Set(people.filter((p) => p.role === 'teacher' && p.isActive).map((p) => p.id))
    const invalid = teacherIds.filter((id) => !valid.has(id))
    if (invalid.length > 0) throw errors.unprocessable('Every assigned user must be an active teacher.', { invalidIds: invalid })
  }
  await courseRepository.replaceTeachers(courseId, teacherIds)
  await auditRepository.record(actor.id, 'course.set_teachers', 'course', courseId)
  return getCourseForAdmin(courseId)
}

export async function listRoster(courseId: string, query: z.infer<typeof rosterQuery>) {
  await getCourseForAdmin(courseId)
  const { rows, total } = await courseRepository.listRoster(courseId, query.search, query)
  return { data: rows, meta: pageMeta(query, total) }
}

export interface EnrollmentReport {
  dryRun: boolean
  enrolled: number
  matched: Array<{ id: string; email: string; fullName: string }>
  alreadyEnrolled: string[]
  duplicates: string[]
  unknown: string[]
  notStudents: string[]
  invalid: string[]
}

/**
 * Enrolls by ids or by a CSV of emails. Idempotent; `dryRun` returns the same
 * report without writing so the UI can preview unmatched emails first.
 */
export async function enroll(
  actor: Profile,
  courseId: string,
  source: { studentIds: string[] } | { csv: string },
  dryRun: boolean,
): Promise<EnrollmentReport> {
  await getCourseForAdmin(courseId)
  const report: EnrollmentReport = {
    dryRun,
    enrolled: 0,
    matched: [],
    alreadyEnrolled: [],
    duplicates: [],
    unknown: [],
    notStudents: [],
    invalid: [],
  }

  let candidates: Awaited<ReturnType<typeof profileRepository.findSummaries>>
  if ('csv' in source) {
    const seen = new Set<string>()
    const emails: string[] = []
    for (const email of parseEmailList(source.csv)) {
      if (!EMAIL_PATTERN.test(email)) report.invalid.push(email)
      else if (seen.has(email)) report.duplicates.push(email)
      else {
        seen.add(email)
        emails.push(email)
      }
    }
    if (emails.length > 1000) throw errors.unprocessable('A CSV import can contain at most 1000 emails.')
    candidates = emails.length ? await profileRepository.findSummaries({ emails }) : []
    const found = new Set(candidates.map((c) => c.email))
    report.unknown = emails.filter((e) => !found.has(e))
  } else {
    const ids = [...new Set(source.studentIds)]
    candidates = await profileRepository.findSummaries({ ids })
    const found = new Set(candidates.map((c) => c.id))
    report.unknown = ids.filter((id) => !found.has(id))
  }

  const students = candidates.filter((c) => c.role === 'student' && c.isActive)
  report.notStudents = candidates.filter((c) => !(c.role === 'student' && c.isActive)).map((c) => c.email)

  const existing = await courseRepository.enrolledStudentIds(
    courseId,
    students.map((s) => s.id),
  )
  const toEnroll = students.filter((s) => !existing.has(s.id))
  report.alreadyEnrolled = students.filter((s) => existing.has(s.id)).map((s) => s.email)
  report.matched = toEnroll.map((s) => ({ id: s.id, email: s.email, fullName: s.fullName }))

  if (!dryRun && toEnroll.length > 0) {
    report.enrolled = await courseRepository.addEnrollments(
      courseId,
      toEnroll.map((s) => s.id),
    )
    await auditRepository.record(actor.id, 'course.enroll', 'course', courseId)
  }
  return report
}

export async function unenroll(actor: Profile, courseId: string, studentId: string) {
  await getCourseForAdmin(courseId)
  const removed = await courseRepository.removeEnrollment(courseId, studentId)
  if (!removed) throw errors.notFound('This student is not enrolled in the course.')
  await auditRepository.record(actor.id, 'course.unenroll', 'enrollment', studentId)
}

/** "My courses" for students, "My classes" for teachers. Archived courses are hidden. */
export async function myCourses(ctx: RequestContext) {
  const { user } = ctx
  if (user.role !== 'student' && user.role !== 'teacher') throw errors.forbidden('Use the admin course list instead.')
  const ids = await accessRepository.courseIdsFor(user.id, user.role)
  const courses = await courseRepository.listByIds(ctx.db, ids)
  return courses.filter((c) => !c.isArchived)
}

export async function getCourse(ctx: RequestContext, courseId: string) {
  const access = await getCourseAccess(ctx.user, courseId)
  if (!access.canView) throw errors.forbidden('You are not a member of this course.')
  const course = await courseRepository.findById(courseId)
  if (!course) throw errors.notFound('Course not found.')
  return {
    ...course,
    viewer: { canManage: access.canManage, isTeacher: access.isTeacher, isStudent: access.isStudent },
  }
}

export async function members(ctx: RequestContext, courseId: string) {
  await assertCanView(ctx.user, courseId)
  const people = await courseRepository.members(courseId)
  // Students see names and roles, not classmates' emails.
  if (ctx.user.role === 'student') return people.map((p) => ({ ...p, email: p.role === 'teacher' ? p.email : '' }))
  return people
}
