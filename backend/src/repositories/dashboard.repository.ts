import { adminDb } from '../config/supabase.js'
import { toNumber, unwrap } from '../utils/db.js'

export async function upcomingAssignments(courseIds: string[], from: Date, limit: number) {
  if (courseIds.length === 0) return []
  const rows = unwrap(
    await adminDb
      .from('assignments')
      .select('id,title,due_at,max_marks,allow_late,course:courses(id,code,title)')
      .in('course_id', courseIds)
      .gte('due_at', from.toISOString())
      .order('due_at')
      .limit(limit),
  ) as unknown as Array<{
    id: string
    title: string
    due_at: string
    max_marks: number | string
    allow_late: boolean
    course: { id: string; code: string; title: string } | null
  }>
  return rows.map((r) => ({ id: r.id, title: r.title, dueAt: r.due_at, maxMarks: Number(r.max_marks), allowLate: r.allow_late, course: r.course }))
}

export async function submittedAssignmentIds(studentId: string, assignmentIds: string[]): Promise<Set<string>> {
  if (assignmentIds.length === 0) return new Set()
  const rows = unwrap(
    await adminDb.from('submissions').select('assignment_id').eq('student_id', studentId).in('assignment_id', assignmentIds),
  ) as Array<{ assignment_id: string }>
  return new Set(rows.map((r) => r.assignment_id))
}

export async function openQuizzes(courseIds: string[], at: Date, limit: number) {
  if (courseIds.length === 0) return []
  const iso = at.toISOString()
  const rows = unwrap(
    await adminDb
      .from('quizzes')
      .select('id,title,closes_at,time_limit_minutes,course:courses(id,code,title)')
      .in('course_id', courseIds)
      .eq('is_published', true)
      .lte('opens_at', iso)
      .gte('closes_at', iso)
      .order('closes_at')
      .limit(limit),
  ) as unknown as Array<{ id: string; title: string; closes_at: string; time_limit_minutes: number; course: { id: string; code: string; title: string } | null }>
  return rows.map((r) => ({ id: r.id, title: r.title, closesAt: r.closes_at, timeLimitMinutes: r.time_limit_minutes, course: r.course }))
}

export async function attemptedQuizIds(studentId: string, quizIds: string[]): Promise<Set<string>> {
  if (quizIds.length === 0) return new Set()
  const rows = unwrap(await adminDb.from('quiz_attempts').select('quiz_id').eq('student_id', studentId).in('quiz_id', quizIds)) as Array<{
    quiz_id: string
  }>
  return new Set(rows.map((r) => r.quiz_id))
}

export async function studentMarkRows(studentId: string) {
  const rows = unwrap(
    await adminDb.from('v_student_marks').select('course_id,kind,item_id,title,obtained,max,graded_at').eq('student_id', studentId),
  ) as Array<{ course_id: string; kind: string; item_id: string; title: string; obtained: number | string | null; max: number | string; graded_at: string | null }>
  return rows.map((r) => ({
    courseId: r.course_id,
    kind: r.kind,
    itemId: r.item_id,
    title: r.title,
    obtained: toNumber(r.obtained),
    max: Number(r.max),
    gradedAt: r.graded_at,
  }))
}

export async function distinctStudentCount(courseIds: string[]): Promise<number> {
  if (courseIds.length === 0) return 0
  const rows = unwrap(await adminDb.from('enrollments').select('student_id').in('course_id', courseIds)) as Array<{ student_id: string }>
  return new Set(rows.map((r) => r.student_id)).size
}

export async function ungradedSubmissions(courseIds: string[], limit: number) {
  if (courseIds.length === 0) return { total: 0, rows: [] }
  const { data, error, count } = await adminDb
    .from('submissions')
    .select('id,submitted_at,is_late,student:profiles!submissions_student_id_fkey(id,full_name),assignment:assignments!inner(id,title,course_id)', {
      count: 'exact',
    })
    .in('assignment.course_id', courseIds)
    .is('graded_at', null)
    .order('submitted_at', { ascending: false })
    .limit(limit)
  if (error) throw error
  const rows = (data ?? []) as unknown as Array<{
    id: string
    submitted_at: string
    is_late: boolean
    student: { id: string; full_name: string } | null
    assignment: { id: string; title: string; course_id: string }
  }>
  return {
    total: count ?? 0,
    rows: rows.map((r) => ({
      id: r.id,
      submittedAt: r.submitted_at,
      isLate: r.is_late,
      student: r.student ? { id: r.student.id, fullName: r.student.full_name } : null,
      assignment: { id: r.assignment.id, title: r.assignment.title, courseId: r.assignment.course_id },
    })),
  }
}
