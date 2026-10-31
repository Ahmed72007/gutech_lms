import * as accessRepository from '../repositories/access.repository.js'
import type { CourseRef } from '../repositories/access.repository.js'
import type { Profile } from '../types/domain.js'
import { errors } from '../utils/http.js'

export interface CourseAccess {
  course: CourseRef
  /** Admin, or a teacher assigned to the course. */
  canManage: boolean
  /** canManage, or an enrolled student of a non-archived course. */
  canView: boolean
  isTeacher: boolean
  isStudent: boolean
}

/** Single source of truth for "what can this user do in this course". */
export async function getCourseAccess(user: Profile, courseId: string): Promise<CourseAccess> {
  const course = await accessRepository.findCourse(courseId)
  if (!course) throw errors.notFound('Course not found.')

  if (user.role === 'admin') {
    return { course, canManage: true, canView: true, isTeacher: false, isStudent: false }
  }
  if (user.role === 'teacher') {
    const teaches = await accessRepository.isTeacher(courseId, user.id)
    return { course, canManage: teaches, canView: teaches, isTeacher: teaches, isStudent: false }
  }
  const enrolled = !course.isArchived && (await accessRepository.isEnrolled(courseId, user.id))
  return { course, canManage: false, canView: enrolled, isTeacher: false, isStudent: enrolled }
}

export async function assertCanView(user: Profile, courseId: string): Promise<CourseAccess> {
  const access = await getCourseAccess(user, courseId)
  if (!access.canView) throw errors.forbidden('You are not a member of this course.')
  return access
}

export async function assertCanManage(user: Profile, courseId: string): Promise<CourseAccess> {
  const access = await getCourseAccess(user, courseId)
  if (!access.canManage) throw errors.forbidden('Only teachers of this course can do that.')
  return access
}

/** Teachers and enrolled students; admins may read but are not chat participants. */
export async function assertIsMember(user: Profile, courseId: string): Promise<CourseAccess> {
  const access = await getCourseAccess(user, courseId)
  if (!access.isTeacher && !access.isStudent) throw errors.forbidden('Only course members can do that.')
  return access
}
