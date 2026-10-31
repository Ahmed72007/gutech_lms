import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { toNumber, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface MarkRow {
  courseId: string
  kind: 'assignment' | 'quiz'
  itemId: string
  title: string
  obtained: number | null
  max: number
  gradedAt: string | null
}

/** Reads v_student_marks as the user (security_invoker view, so RLS applies). */
export async function studentMarks(db: SupabaseClient, studentId: string, courseId?: string): Promise<MarkRow[]> {
  let query = db.from('v_student_marks').select('course_id,kind,item_id,title,obtained,max,graded_at').eq('student_id', studentId)
  if (courseId) query = query.eq('course_id', courseId)
  const rows = unwrap(
    await query.returns<
      Array<{
        course_id: string
        kind: 'assignment' | 'quiz'
        item_id: string
        title: string
        obtained: number | string | null
        max: number | string
        graded_at: string | null
      }>
    >(),
  )
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

export async function coursesByIds(ids: string[]): Promise<Array<{ id: string; code: string; title: string }>> {
  if (ids.length === 0) return []
  return unwrap(await adminDb.from('courses').select('id,code,title').in('id', ids).order('code')) as Array<{ id: string; code: string; title: string }>
}

export interface GradebookItem {
  id: string
  kind: 'assignment' | 'quiz'
  title: string
  max: number
  dueAt: string
}

export async function gradebookItems(courseId: string): Promise<GradebookItem[]> {
  const [assignments, quizzes] = await Promise.all([
    adminDb.from('assignments').select('id,title,max_marks,due_at').eq('course_id', courseId).order('due_at'),
    adminDb.from('quizzes').select('id,title,closes_at,quiz_questions(marks)').eq('course_id', courseId).order('closes_at'),
  ])
  const a = (unwrap(assignments) as Array<{ id: string; title: string; max_marks: number | string; due_at: string }>).map(
    (r): GradebookItem => ({ id: r.id, kind: 'assignment', title: r.title, max: Number(r.max_marks), dueAt: r.due_at }),
  )
  const q = (unwrap(quizzes) as Array<{ id: string; title: string; closes_at: string; quiz_questions: Array<{ marks: number | string }> }>).map(
    (r): GradebookItem => ({
      id: r.id,
      kind: 'quiz',
      title: r.title,
      max: r.quiz_questions.reduce((sum, x) => sum + Number(x.marks), 0),
      dueAt: r.closes_at,
    }),
  )
  return [...a, ...q].sort((x, y) => x.dueAt.localeCompare(y.dueAt))
}

export interface GradebookStudent {
  id: string
  fullName: string
  email: string
  rollNo: string | null
}

export async function gradebookStudents(courseId: string, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  const { rows, total } = unwrapCount(
    await adminDb
      .from('enrollments')
      .select('student:profiles!inner(id,full_name,email,roll_no)', { count: 'exact' })
      .eq('course_id', courseId)
      .order('student_id')
      .range(from, to)
      .returns<Array<{ student: { id: string; full_name: string; email: string; roll_no: string | null } }>>(),
  )
  return {
    total,
    rows: rows
      .map((r): GradebookStudent => ({ id: r.student.id, fullName: r.student.full_name, email: r.student.email, rollNo: r.student.roll_no }))
      .sort((a, b) => a.fullName.localeCompare(b.fullName)),
  }
}

export interface GradebookCell {
  itemId: string
  studentId: string
  obtained: number | null
  submissionId: string | null
  submitted: boolean
}

/** All submissions and finished attempts for these students and items, in two queries. */
export async function gradebookCells(items: GradebookItem[], studentIds: string[]): Promise<GradebookCell[]> {
  if (studentIds.length === 0 || items.length === 0) return []
  const assignmentIds = items.filter((i) => i.kind === 'assignment').map((i) => i.id)
  const quizIds = items.filter((i) => i.kind === 'quiz').map((i) => i.id)

  const [subs, attempts] = await Promise.all([
    assignmentIds.length
      ? adminDb.from('submissions').select('id,assignment_id,student_id,marks_obtained,graded_at').in('assignment_id', assignmentIds).in('student_id', studentIds)
      : Promise.resolve({ data: [], error: null }),
    quizIds.length
      ? adminDb.from('quiz_attempts').select('quiz_id,student_id,score,submitted_at').in('quiz_id', quizIds).in('student_id', studentIds).not('submitted_at', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ])

  const cells: GradebookCell[] = []
  for (const s of unwrap(subs) as Array<{ id: string; assignment_id: string; student_id: string; marks_obtained: number | string | null; graded_at: string | null }>) {
    cells.push({
      itemId: s.assignment_id,
      studentId: s.student_id,
      obtained: s.graded_at ? toNumber(s.marks_obtained) : null,
      submissionId: s.id,
      submitted: true,
    })
  }
  for (const a of unwrap(attempts) as Array<{ quiz_id: string; student_id: string; score: number | string | null }>) {
    cells.push({ itemId: a.quiz_id, studentId: a.student_id, obtained: toNumber(a.score), submissionId: null, submitted: true })
  }
  return cells
}
