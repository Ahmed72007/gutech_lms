import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import type { QuestionInput } from '../schemas/quiz.schema.js'
import { toNumber, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export type QuestionType = 'mcq_single' | 'mcq_multi' | 'true_false'

export interface Quiz {
  id: string
  courseId: string
  createdBy: string
  title: string
  description: string | null
  timeLimitMinutes: number
  opensAt: string
  closesAt: string
  isPublished: boolean
  shuffleQuestions: boolean
  createdAt: string
  updatedAt: string
}

const QUIZ_COLUMNS =
  'id,course_id,created_by,title,description,time_limit_minutes,opens_at,closes_at,is_published,shuffle_questions,created_at,updated_at'

interface QuizRow {
  id: string
  course_id: string
  created_by: string
  title: string
  description: string | null
  time_limit_minutes: number
  opens_at: string
  closes_at: string
  is_published: boolean
  shuffle_questions: boolean
  created_at: string
  updated_at: string
}

function toQuiz(r: QuizRow): Quiz {
  return {
    id: r.id,
    courseId: r.course_id,
    createdBy: r.created_by,
    title: r.title,
    description: r.description,
    timeLimitMinutes: r.time_limit_minutes,
    opensAt: r.opens_at,
    closesAt: r.closes_at,
    isPublished: r.is_published,
    shuffleQuestions: r.shuffle_questions,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export async function listForCourse(db: SupabaseClient, courseId: string, publishedOnly: boolean, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  let query = db
    .from('quizzes')
    .select(QUIZ_COLUMNS, { count: 'exact' })
    .eq('course_id', courseId)
    .order('opens_at', { ascending: false })
    .range(from, to)
  if (publishedOnly) query = query.eq('is_published', true)
  const { rows, total } = unwrapCount(await query.returns<QuizRow[]>())
  return { rows: rows.map(toQuiz), total }
}

export async function findById(id: string): Promise<Quiz | null> {
  const row = unwrap(await adminDb.from('quizzes').select(QUIZ_COLUMNS).eq('id', id).maybeSingle<QuizRow>())
  return row ? toQuiz(row) : null
}

export interface QuizWrite {
  title?: string
  description?: string | null
  timeLimitMinutes?: number
  opensAt?: Date
  closesAt?: Date
  isPublished?: boolean
  shuffleQuestions?: boolean
}

function toColumns(input: QuizWrite): Record<string, unknown> {
  const values: Record<string, unknown> = {}
  if (input.title !== undefined) values.title = input.title
  if (input.description !== undefined) values.description = input.description
  if (input.timeLimitMinutes !== undefined) values.time_limit_minutes = input.timeLimitMinutes
  if (input.opensAt !== undefined) values.opens_at = input.opensAt.toISOString()
  if (input.closesAt !== undefined) values.closes_at = input.closesAt.toISOString()
  if (input.isPublished !== undefined) values.is_published = input.isPublished
  if (input.shuffleQuestions !== undefined) values.shuffle_questions = input.shuffleQuestions
  return values
}

export async function insert(courseId: string, createdBy: string, input: QuizWrite): Promise<Quiz> {
  const row = unwrap(
    await adminDb
      .from('quizzes')
      .insert({ ...toColumns(input), course_id: courseId, created_by: createdBy })
      .select(QUIZ_COLUMNS)
      .single<QuizRow>(),
  )
  return toQuiz(row)
}

export async function update(id: string, input: QuizWrite): Promise<Quiz> {
  const values = toColumns(input)
  if (Object.keys(values).length === 0) {
    const quiz = await findById(id)
    if (!quiz) throw new Error('Quiz disappeared')
    return quiz
  }
  const row = unwrap(await adminDb.from('quizzes').update(values).eq('id', id).select(QUIZ_COLUMNS).single<QuizRow>())
  return toQuiz(row)
}

export async function remove(id: string): Promise<void> {
  unwrap(await adminDb.from('quizzes').delete().eq('id', id))
}

/** Replaces questions and the answer key atomically (SQL function). */
export async function saveQuestions(quizId: string, questions: QuestionInput[]): Promise<void> {
  unwrap(await adminDb.rpc('save_quiz_questions', { p_quiz_id: quizId, p_questions: questions }))
}

export interface Question {
  id: string
  position: number
  type: QuestionType
  prompt: string
  options: Array<{ id: string; text: string }>
  marks: number
}

export interface QuestionWithAnswer extends Question {
  correctOptionIds: string[]
}

interface QuestionRow {
  id: string
  position: number
  type: QuestionType
  prompt: string
  options: Array<{ id: string; text: string }>
  marks: number | string
  quiz_answers?: { correct_option_ids: string[] } | Array<{ correct_option_ids: string[] }> | null
}

function toQuestion(r: QuestionRow): Question {
  return { id: r.id, position: r.position, type: r.type, prompt: r.prompt, options: r.options, marks: Number(r.marks) }
}

/** Questions WITHOUT the answer key: safe to send to students. */
export async function publicQuestions(quizId: string): Promise<Question[]> {
  const rows = unwrap(
    await adminDb.from('quiz_questions').select('id,position,type,prompt,options,marks').eq('quiz_id', quizId).order('position').returns<QuestionRow[]>(),
  )
  return rows.map(toQuestion)
}

/** Questions with the answer key: teachers/admins and server-side grading only. */
export async function questionsWithAnswers(quizId: string): Promise<QuestionWithAnswer[]> {
  const rows = unwrap(
    await adminDb
      .from('quiz_questions')
      .select('id,position,type,prompt,options,marks,quiz_answers(correct_option_ids)')
      .eq('quiz_id', quizId)
      .order('position')
      .returns<QuestionRow[]>(),
  )
  return rows.map((r) => {
    const answer = Array.isArray(r.quiz_answers) ? r.quiz_answers[0] : r.quiz_answers
    return { ...toQuestion(r), correctOptionIds: answer?.correct_option_ids ?? [] }
  })
}

/** Question count and total marks per quiz in one query. */
export async function questionStats(quizIds: string[]): Promise<Map<string, { count: number; totalMarks: number }>> {
  const stats = new Map<string, { count: number; totalMarks: number }>()
  if (quizIds.length === 0) return stats
  const rows = unwrap(await adminDb.from('quiz_questions').select('quiz_id,marks').in('quiz_id', quizIds)) as Array<{
    quiz_id: string
    marks: number | string
  }>
  for (const r of rows) {
    const s = stats.get(r.quiz_id) ?? { count: 0, totalMarks: 0 }
    s.count += 1
    s.totalMarks += Number(r.marks)
    stats.set(r.quiz_id, s)
  }
  return stats
}

export async function attemptCounts(quizIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (quizIds.length === 0) return counts
  const rows = unwrap(await adminDb.from('quiz_attempts').select('quiz_id').in('quiz_id', quizIds)) as Array<{ quiz_id: string }>
  for (const r of rows) counts.set(r.quiz_id, (counts.get(r.quiz_id) ?? 0) + 1)
  return counts
}

// Attempts ------------------------------------------------------------------

export interface Attempt {
  id: string
  quizId: string
  studentId: string
  startedAt: string
  submittedAt: string | null
  answers: Record<string, string[]>
  score: number | null
}

const ATTEMPT_COLUMNS = 'id,quiz_id,student_id,started_at,submitted_at,answers,score'

interface AttemptRow {
  id: string
  quiz_id: string
  student_id: string
  started_at: string
  submitted_at: string | null
  answers: Record<string, string[]>
  score: number | string | null
}

function toAttempt(r: AttemptRow): Attempt {
  return {
    id: r.id,
    quizId: r.quiz_id,
    studentId: r.student_id,
    startedAt: r.started_at,
    submittedAt: r.submitted_at,
    answers: r.answers ?? {},
    score: toNumber(r.score),
  }
}

export async function findAttempt(quizId: string, studentId: string): Promise<Attempt | null> {
  const row = unwrap(
    await adminDb.from('quiz_attempts').select(ATTEMPT_COLUMNS).eq('quiz_id', quizId).eq('student_id', studentId).maybeSingle<AttemptRow>(),
  )
  return row ? toAttempt(row) : null
}

export async function ownAttempts(db: SupabaseClient, studentId: string, quizIds: string[]): Promise<Map<string, Attempt>> {
  if (quizIds.length === 0) return new Map()
  const rows = unwrap(
    await db.from('quiz_attempts').select(ATTEMPT_COLUMNS).eq('student_id', studentId).in('quiz_id', quizIds).returns<AttemptRow[]>(),
  )
  return new Map(rows.map((r) => [r.quiz_id, toAttempt(r)]))
}

/** The unique (quiz_id, student_id) constraint guarantees a single attempt even under races. */
export async function insertAttempt(quizId: string, studentId: string, startedAt: Date): Promise<Attempt> {
  const row = unwrap(
    await adminDb
      .from('quiz_attempts')
      .insert({ quiz_id: quizId, student_id: studentId, started_at: startedAt.toISOString() })
      .select(ATTEMPT_COLUMNS)
      .single<AttemptRow>(),
  )
  return toAttempt(row)
}

/** Only finalizes an attempt that is still open; returns null if it was already submitted. */
export async function finalizeAttempt(
  attemptId: string,
  input: { answers: Record<string, string[]>; score: number; submittedAt: Date },
): Promise<Attempt | null> {
  const row = unwrap(
    await adminDb
      .from('quiz_attempts')
      .update({ answers: input.answers, score: input.score, submitted_at: input.submittedAt.toISOString() })
      .eq('id', attemptId)
      .is('submitted_at', null)
      .select(ATTEMPT_COLUMNS)
      .maybeSingle<AttemptRow>(),
  )
  return row ? toAttempt(row) : null
}

export async function attemptsRoster(courseId: string, quizId: string, pagination: Pagination) {
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
  const attempts = ids.length
    ? unwrap(await adminDb.from('quiz_attempts').select(ATTEMPT_COLUMNS).eq('quiz_id', quizId).in('student_id', ids).returns<AttemptRow[]>())
    : []
  const byStudent = new Map(attempts.map((a) => [a.student_id, toAttempt(a)]))
  return {
    total,
    rows: rows
      .map((r) => ({
        student: { id: r.student.id, fullName: r.student.full_name, email: r.student.email, rollNo: r.student.roll_no },
        attempt: byStudent.get(r.student.id) ?? null,
      }))
      .sort((a, b) => a.student.fullName.localeCompare(b.student.fullName)),
  }
}
