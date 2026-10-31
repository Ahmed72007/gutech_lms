import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { toNumber, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface Assignment {
  id: string
  courseId: string
  createdBy: string
  title: string
  instructions: string
  maxMarks: number
  dueAt: string
  allowLate: boolean
  attachmentPath: string | null
  attachmentName: string | null
  createdAt: string
  updatedAt: string
}

const COLUMNS = 'id,course_id,created_by,title,instructions,max_marks,due_at,allow_late,attachment_path,attachment_name,created_at,updated_at'

interface Row {
  id: string
  course_id: string
  created_by: string
  title: string
  instructions: string
  max_marks: number | string
  due_at: string
  allow_late: boolean
  attachment_path: string | null
  attachment_name: string | null
  created_at: string
  updated_at: string
}

function toAssignment(r: Row): Assignment {
  return {
    id: r.id,
    courseId: r.course_id,
    createdBy: r.created_by,
    title: r.title,
    instructions: r.instructions,
    maxMarks: Number(r.max_marks),
    dueAt: r.due_at,
    allowLate: r.allow_late,
    attachmentPath: r.attachment_path,
    attachmentName: r.attachment_name,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listForCourse(db: SupabaseClient, courseId: string, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  const { rows, total } = unwrapCount(
    await db
      .from('assignments')
      .select(COLUMNS, { count: 'exact' })
      .eq('course_id', courseId)
      .order('due_at', { ascending: true })
      .range(from, to)
      .returns<Row[]>(),
  )
  return { rows: rows.map(toAssignment), total }
}

export async function findById(id: string): Promise<Assignment | null> {
  const row = unwrap(await adminDb.from('assignments').select(COLUMNS).eq('id', id).maybeSingle<Row>())
  return row ? toAssignment(row) : null
}

export interface AssignmentWrite {
  title?: string
  instructions?: string
  maxMarks?: number
  dueAt?: Date
  allowLate?: boolean
  attachmentPath?: string | null
  attachmentName?: string | null
}

function toColumns(input: AssignmentWrite): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  if (input.title !== undefined) values.title = input.title
  if (input.instructions !== undefined) values.instructions = input.instructions
  if (input.maxMarks !== undefined) values.max_marks = input.maxMarks
  if (input.dueAt !== undefined) values.due_at = input.dueAt.toISOString()
  if (input.allowLate !== undefined) values.allow_late = input.allowLate
  if (input.attachmentPath !== undefined) values.attachment_path = input.attachmentPath
  if (input.attachmentName !== undefined) values.attachment_name = input.attachmentName
  return values
}

export async function insert(courseId: string, createdBy: string, input: AssignmentWrite): Promise<Assignment> {
  const row = unwrap(
    await adminDb
      .from('assignments')
      .insert({ ...toColumns(input), course_id: courseId, created_by: createdBy })
      .select(COLUMNS)
      .single<Row>(),
  )
  return toAssignment(row)
}

export async function update(id: string, input: AssignmentWrite): Promise<Assignment> {
  const row = unwrap(await adminDb.from('assignments').update(toColumns(input)).eq('id', id).select(COLUMNS).single<Row>())
  return toAssignment(row)
}

export async function remove(id: string): Promise<void> {
  unwrap(await adminDb.from('assignments').delete().eq('id', id))
}

// Submissions ---------------------------------------------------------------

export interface Submission {
  id: string
  assignmentId: string
  studentId: string
  textAnswer: string | null
  filePath: string | null
  fileName: string | null
  submittedAt: string
  isLate: boolean
  marksObtained: number | null
  feedback: string | null
  gradedAt: string | null
  gradedBy: string | null
}

const SUBMISSION_COLUMNS =
  'id,assignment_id,student_id,text_answer,file_path,file_name,submitted_at,is_late,marks_obtained,feedback,graded_at,graded_by'

interface SubmissionRow {
  id: string
  assignment_id: string
  student_id: string
  text_answer: string | null
  file_path: string | null
  file_name: string | null
  submitted_at: string
  is_late: boolean
  marks_obtained: number | string | null
  feedback: string | null
  graded_at: string | null
  graded_by: string | null
}

function toSubmission(r: SubmissionRow): Submission {
  return {
    id: r.id,
    assignmentId: r.assignment_id,
    studentId: r.student_id,
    textAnswer: r.text_answer,
    filePath: r.file_path,
    fileName: r.file_name,
    submittedAt: r.submitted_at,
    isLate: r.is_late,
    marksObtained: toNumber(r.marks_obtained),
    feedback: r.feedback,
    gradedAt: r.graded_at,
    gradedBy: r.graded_by,
  }
}

/** The caller's own submissions for the given assignments (RLS: own rows only). */
export async function ownSubmissions(db: SupabaseClient, studentId: string, assignmentIds: string[]): Promise<Map<string, Submission>> {
  if (assignmentIds.length === 0) return new Map()
  const rows = unwrap(
    await db.from('submissions').select(SUBMISSION_COLUMNS).eq('student_id', studentId).in('assignment_id', assignmentIds).returns<SubmissionRow[]>(),
  )
  return new Map(rows.map((r) => [r.assignment_id, toSubmission(r)]))
}

/** Submitted / graded counts per assignment for teachers (one query). */
export async function submissionStats(assignmentIds: string[]): Promise<Map<string, { submitted: number; graded: number }>> {
  const stats = new Map<string, { submitted: number; graded: number }>()
  if (assignmentIds.length === 0) return stats
  const rows = unwrap(
    await adminDb.from('submissions').select('assignment_id,graded_at').in('assignment_id', assignmentIds),
  ) as Array<{ assignment_id: string; graded_at: string | null }>
  for (const r of rows) {
    const s = stats.get(r.assignment_id) ?? { submitted: 0, graded: 0 }
    s.submitted += 1
    if (r.graded_at) s.graded += 1
    stats.set(r.assignment_id, s)
  }
  return stats
}

export async function findSubmission(assignmentId: string, studentId: string): Promise<Submission | null> {
  const row = unwrap(
    await adminDb
      .from('submissions')
      .select(SUBMISSION_COLUMNS)
      .eq('assignment_id', assignmentId)
      .eq('student_id', studentId)
      .maybeSingle<SubmissionRow>(),
  )
  return row ? toSubmission(row) : null
}

export async function findSubmissionById(id: string): Promise<Submission | null> {
  const row = unwrap(await adminDb.from('submissions').select(SUBMISSION_COLUMNS).eq('id', id).maybeSingle<SubmissionRow>())
  return row ? toSubmission(row) : null
}

/** Create or replace. Resubmission always clears any previous grade. */
export async function upsertSubmission(input: {
  assignmentId: string
  studentId: string
  textAnswer: string | null
  filePath: string | null
  fileName: string | null
  isLate: boolean
  submittedAt: Date
}): Promise<Submission> {
  const row = unwrap(
    await adminDb
      .from('submissions')
      .upsert(
        {
          assignment_id: input.assignmentId,
          student_id: input.studentId,
          text_answer: input.textAnswer,
          file_path: input.filePath,
          file_name: input.fileName,
          is_late: input.isLate,
          submitted_at: input.submittedAt.toISOString(),
          marks_obtained: null,
          feedback: null,
          graded_by: null,
          graded_at: null,
        },
        { onConflict: 'assignment_id,student_id' },
      )
      .select(SUBMISSION_COLUMNS)
      .single<SubmissionRow>(),
  )
  return toSubmission(row)
}

export async function grade(id: string, input: { marks: number; feedback: string | null; graderId: string; gradedAt: Date }): Promise<Submission> {
  const row = unwrap(
    await adminDb
      .from('submissions')
      .update({
        marks_obtained: input.marks,
        feedback: input.feedback,
        graded_by: input.graderId,
        graded_at: input.gradedAt.toISOString(),
      })
      .eq('id', id)
      .select(SUBMISSION_COLUMNS)
      .single<SubmissionRow>(),
  )
  return toSubmission(row)
}

export async function highestGrade(assignmentId: string): Promise<number | null> {
  const row = unwrap(
    await adminDb
      .from('submissions')
      .select('marks_obtained')
      .eq('assignment_id', assignmentId)
      .not('marks_obtained', 'is', null)
      .order('marks_obtained', { ascending: false })
      .limit(1)
      .maybeSingle<{ marks_obtained: number | string }>(),
  )
  return row ? Number(row.marks_obtained) : null
}

export async function submissionFilePaths(assignmentId: string): Promise<string[]> {
  const rows = unwrap(
    await adminDb.from('submissions').select('file_path').eq('assignment_id', assignmentId).not('file_path', 'is', null),
  ) as Array<{ file_path: string }>
  return rows.map((r) => r.file_path)
}

export interface RosterEntry {
  student: { id: string; fullName: string; email: string; rollNo: string | null }
  submission: Submission | null
}

/** Enrolled students (paginated) with their submission, if any. */
export async function roster(courseId: string, assignmentId: string, pagination: Pagination) {
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
  const ids = rows.map((r) => r.student.id)
  const subs = ids.length
    ? (unwrap(
        await adminDb.from('submissions').select(SUBMISSION_COLUMNS).eq('assignment_id', assignmentId).in('student_id', ids).returns<SubmissionRow[]>(),
      ) ?? [])
    : []
  const byStudent = new Map(subs.map((s) => [s.student_id, toSubmission(s)]))
  const entries: RosterEntry[] = rows
    .map((r) => ({
      student: { id: r.student.id, fullName: r.student.full_name, email: r.student.email, rollNo: r.student.roll_no },
      submission: byStudent.get(r.student.id) ?? null,
    }))
    .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName))
  return { rows: entries, total }
}
