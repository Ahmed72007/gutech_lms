import { adminDb } from '../config/supabase.js'
import { unwrap } from '../utils/db.js'

export interface CourseRef {
  id: string
  code: string
  title: string
  isArchived: boolean
}

export async function findCourse(courseId: string): Promise<CourseRef | null> {
  const row = unwrap(
    await adminDb
      .from('courses')
      .select('id,code,title,is_archived')
      .eq('id', courseId)
      .maybeSingle<{ id: string; code: string; title: string; is_archived: boolean }>(),
  )
  return row ? { id: row.id, code: row.code, title: row.title, isArchived: row.is_archived } : null
}

export async function isTeacher(courseId: string, userId: string): Promise<boolean> {
  const { count, error } = await adminDb
    .from('course_teachers')
    .select('course_id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('teacher_id', userId)
  if (error) throw error
  return (count ?? 0) > 0
}

export async function isEnrolled(courseId: string, userId: string): Promise<boolean> {
  const { count, error } = await adminDb
    .from('enrollments')
    .select('course_id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .eq('student_id', userId)
  if (error) throw error
  return (count ?? 0) > 0
}

/** Course ids a user teaches or is enrolled in (non-archived for students). */
export async function courseIdsFor(userId: string, role: 'teacher' | 'student'): Promise<string[]> {
  if (role === 'teacher') {
    const rows = unwrap(await adminDb.from('course_teachers').select('course_id').eq('teacher_id', userId)) as Array<{ course_id: string }>
    return rows.map((r) => r.course_id)
  }
  const rows = unwrap(
    await adminDb.from('enrollments').select('course_id, courses!inner(is_archived)').eq('student_id', userId).eq('courses.is_archived', false),
  ) as Array<{ course_id: string }>
  return rows.map((r) => r.course_id)
}
