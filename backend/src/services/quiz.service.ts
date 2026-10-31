import type { z } from 'zod'
import * as auditRepository from '../repositories/audit.repository.js'
import * as quizRepository from '../repositories/quiz.repository.js'
import type { Attempt, Question, QuestionWithAnswer, Quiz } from '../repositories/quiz.repository.js'
import type { createQuizSchema, quizListQuery, resultsQuery, submitAttemptSchema, updateQuizSchema } from '../schemas/quiz.schema.js'
import type { RequestContext } from '../types/domain.js'
import { DbError } from '../utils/db.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { addMinutes, now } from '../utils/time.js'
import { assertCanManage, assertCanView, getCourseAccess } from './access.service.js'

/** Network grace period after the timer hits zero. */
export const SUBMIT_GRACE_MS = 10_000

export type QuizWindow = 'draft' | 'upcoming' | 'open' | 'closed'
export type AttemptStatus = 'in_progress' | 'submitted' | 'expired'

export function quizWindow(quiz: Quiz, at = now()): QuizWindow {
  if (!quiz.isPublished) return 'draft'
  if (at < new Date(quiz.opensAt)) return 'upcoming'
  if (at > new Date(quiz.closesAt)) return 'closed'
  return 'open'
}

export function attemptExpiresAt(quiz: Quiz, attempt: Pick<Attempt, 'startedAt'>): Date {
  return addMinutes(new Date(attempt.startedAt), quiz.timeLimitMinutes)
}

function attemptStatus(quiz: Quiz, attempt: Attempt, at = now()): AttemptStatus {
  if (attempt.submittedAt) return 'submitted'
  return at.getTime() > attemptExpiresAt(quiz, attempt).getTime() + SUBMIT_GRACE_MS ? 'expired' : 'in_progress'
}

function presentQuiz(quiz: Quiz) {
  return {
    id: quiz.id,
    courseId: quiz.courseId,
    title: quiz.title,
    description: quiz.description,
    timeLimitMinutes: quiz.timeLimitMinutes,
    opensAt: quiz.opensAt,
    closesAt: quiz.closesAt,
    isPublished: quiz.isPublished,
    shuffleQuestions: quiz.shuffleQuestions,
    window: quizWindow(quiz),
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt,
  }
}

function presentAttempt(quiz: Quiz, attempt: Attempt) {
  return {
    id: attempt.id,
    status: attemptStatus(quiz, attempt),
    startedAt: attempt.startedAt,
    expiresAt: attemptExpiresAt(quiz, attempt).toISOString(),
    submittedAt: attempt.submittedAt,
    score: attempt.submittedAt ? attempt.score : null,
  }
}

/** All-or-nothing per question: the chosen set must equal the correct set exactly. */
export function scoreAnswers(questions: QuestionWithAnswer[], answers: Record<string, string[]>) {
  let score = 0
  let correctCount = 0
  for (const q of questions) {
    const chosen = new Set(answers[q.id] ?? [])
    const correct = new Set(q.correctOptionIds)
    const isCorrect = chosen.size === correct.size && [...correct].every((id) => chosen.has(id))
    if (isCorrect) {
      score += q.marks
      correctCount += 1
    }
  }
  return { score: Math.round(score * 100) / 100, correctCount }
}

/** Deterministic per-attempt shuffle so a resumed attempt keeps the same order. */
function shuffleFor<T>(items: T[], seedText: string): T[] {
  let seed = 0
  for (const ch of seedText) seed = (Math.imul(seed, 31) + ch.charCodeAt(0)) | 0
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j] as T, copy[i] as T]
  }
  return copy
}

async function loadQuiz(id: string): Promise<Quiz> {
  const quiz = await quizRepository.findById(id)
  if (!quiz) throw errors.notFound('Quiz not found.')
  return quiz
}

/** A student only ever sees published quizzes of courses they are enrolled in. */
async function loadQuizForStudent(ctx: RequestContext, quizId: string): Promise<Quiz> {
  if (ctx.user.role !== 'student') throw errors.forbidden('Only students can attempt quizzes.')
  const quiz = await loadQuiz(quizId)
  const access = await getCourseAccess(ctx.user, quiz.courseId)
  if (!access.isStudent) throw errors.forbidden('You are not enrolled in this course.')
  if (!quiz.isPublished) throw errors.notFound('Quiz not found.')
  return quiz
}

/** An attempt whose timer ran out without a submission is closed with no answers (score 0). */
async function closeExpiredAttempt(quiz: Quiz, attempt: Attempt): Promise<Attempt> {
  if (attemptStatus(quiz, attempt) !== 'expired') return attempt
  const closed = await quizRepository.finalizeAttempt(attempt.id, { answers: {}, score: 0, submittedAt: attemptExpiresAt(quiz, attempt) })
  return closed ?? attempt
}

export async function create(ctx: RequestContext, courseId: string, input: z.infer<typeof createQuizSchema>) {
  await assertCanManage(ctx.user, courseId)
  const { questions, ...fields } = input
  const quiz = await quizRepository.insert(courseId, ctx.user.id, fields)
  try {
    await quizRepository.saveQuestions(quiz.id, questions)
  } catch (error) {
    await quizRepository.remove(quiz.id)
    throw error
  }
  return getForManager(quiz)
}

async function getForManager(quiz: Quiz) {
  const [questions, attempts] = await Promise.all([quizRepository.questionsWithAnswers(quiz.id), quizRepository.attemptCounts([quiz.id])])
  return {
    ...presentQuiz(quiz),
    questions,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    attemptCount: attempts.get(quiz.id) ?? 0,
  }
}

export async function list(ctx: RequestContext, courseId: string, query: z.infer<typeof quizListQuery>) {
  const access = await assertCanView(ctx.user, courseId)
  const { rows, total } = await quizRepository.listForCourse(ctx.db, courseId, !access.canManage, query)
  const ids = rows.map((q) => q.id)
  const stats = await quizRepository.questionStats(ids)

  if (access.isStudent) {
    const attempts = await quizRepository.ownAttempts(ctx.db, ctx.user.id, ids)
    return {
      data: rows.map((q) => {
        const attempt = attempts.get(q.id)
        return {
          ...presentQuiz(q),
          questionCount: stats.get(q.id)?.count ?? 0,
          totalMarks: stats.get(q.id)?.totalMarks ?? 0,
          myAttempt: attempt ? presentAttempt(q, attempt) : null,
        }
      }),
      meta: pageMeta(query, total),
    }
  }

  const attemptCounts = await quizRepository.attemptCounts(ids)
  return {
    data: rows.map((q) => ({
      ...presentQuiz(q),
      questionCount: stats.get(q.id)?.count ?? 0,
      totalMarks: stats.get(q.id)?.totalMarks ?? 0,
      attemptCount: attemptCounts.get(q.id) ?? 0,
    })),
    meta: pageMeta(query, total),
  }
}

export async function get(ctx: RequestContext, quizId: string) {
  const quiz = await loadQuiz(quizId)
  const access = await assertCanView(ctx.user, quiz.courseId)
  if (access.canManage) return { ...(await getForManager(quiz)), course: access.course, viewer: { canManage: true } }

  if (!quiz.isPublished) throw errors.notFound('Quiz not found.')
  const stats = await quizRepository.questionStats([quiz.id])
  let attempt = await quizRepository.findAttempt(quiz.id, ctx.user.id)
  if (attempt) attempt = await closeExpiredAttempt(quiz, attempt)
  return {
    ...presentQuiz(quiz),
    course: access.course,
    viewer: { canManage: false },
    questionCount: stats.get(quiz.id)?.count ?? 0,
    totalMarks: stats.get(quiz.id)?.totalMarks ?? 0,
    myAttempt: attempt ? presentAttempt(quiz, attempt) : null,
  }
}

export async function update(ctx: RequestContext, quizId: string, input: z.infer<typeof updateQuizSchema>) {
  const quiz = await loadQuiz(quizId)
  await assertCanManage(ctx.user, quiz.courseId)

  const { questions, ...fields } = input
  const editsContent = questions !== undefined || Object.entries(fields).some(([key, value]) => key !== 'isPublished' && value !== undefined)
  if (editsContent) {
    const attempts = await quizRepository.attemptCounts([quiz.id])
    if ((attempts.get(quiz.id) ?? 0) > 0) {
      throw errors.conflict('This quiz can no longer be edited because students have already attempted it.', 'QUIZ_LOCKED')
    }
  }

  const opensAt = fields.opensAt ?? new Date(quiz.opensAt)
  const closesAt = fields.closesAt ?? new Date(quiz.closesAt)
  if (closesAt <= opensAt) {
    throw errors.unprocessable('Closing time must be after opening time.', [{ path: 'closesAt', message: 'Must be after opening time' }])
  }

  if (questions) await quizRepository.saveQuestions(quiz.id, questions)
  const updated = await quizRepository.update(quiz.id, fields)
  return getForManager(updated)
}

export async function remove(ctx: RequestContext, quizId: string) {
  const quiz = await loadQuiz(quizId)
  await assertCanManage(ctx.user, quiz.courseId)
  const attempts = await quizRepository.attemptCounts([quiz.id])
  if ((attempts.get(quiz.id) ?? 0) > 0) throw errors.conflict('A quiz with attempts cannot be deleted. Unpublish it instead.', 'QUIZ_LOCKED')
  await quizRepository.remove(quiz.id)
  await auditRepository.record(ctx.user.id, 'quiz.delete', 'quiz', quiz.id)
}

function attemptPayload(quiz: Quiz, attempt: Attempt, questions: Question[]) {
  const ordered = quiz.shuffleQuestions ? shuffleFor(questions, attempt.id) : questions
  return {
    attemptId: attempt.id,
    quizId: quiz.id,
    title: quiz.title,
    startedAt: attempt.startedAt,
    expiresAt: attemptExpiresAt(quiz, attempt).toISOString(),
    serverTime: now().toISOString(),
    // Deliberately no answer key in this payload.
    questions: ordered.map((q) => ({ id: q.id, type: q.type, prompt: q.prompt, options: q.options, marks: q.marks })),
  }
}

/** Starts (or resumes an unexpired) attempt. A second attempt is rejected with 409. */
export async function startAttempt(ctx: RequestContext, quizId: string) {
  const quiz = await loadQuizForStudent(ctx, quizId)
  const existing = await quizRepository.findAttempt(quiz.id, ctx.user.id)

  if (existing) {
    const current = await closeExpiredAttempt(quiz, existing)
    if (current.submittedAt) throw errors.conflict('You have already attempted this quiz.', 'ALREADY_ATTEMPTED')
    return attemptPayload(quiz, current, await quizRepository.publicQuestions(quiz.id))
  }

  const window = quizWindow(quiz)
  if (window === 'upcoming') throw errors.conflict('This quiz is not open yet.', 'QUIZ_NOT_OPEN')
  if (window === 'closed') throw errors.conflict('This quiz has closed.', 'QUIZ_CLOSED')

  let attempt: Attempt
  try {
    attempt = await quizRepository.insertAttempt(quiz.id, ctx.user.id, now())
  } catch (error) {
    if (error instanceof DbError && error.pgCode === '23505') {
      throw errors.conflict('You have already attempted this quiz.', 'ALREADY_ATTEMPTED')
    }
    throw error
  }
  return attemptPayload(quiz, attempt, await quizRepository.publicQuestions(quiz.id))
}

/**
 * Grades on the server against quiz_answers. Past the time limit (+10 s grace)
 * the submitted answers are discarded and unanswered questions score 0.
 */
export async function submitAttempt(ctx: RequestContext, quizId: string, input: z.infer<typeof submitAttemptSchema>) {
  const quiz = await loadQuizForStudent(ctx, quizId)
  const attempt = await quizRepository.findAttempt(quiz.id, ctx.user.id)
  if (!attempt) throw errors.notFound('Start the quiz before submitting.')
  if (attempt.submittedAt) throw errors.conflict('This attempt has already been submitted.', 'ALREADY_SUBMITTED')

  const submittedAt = now()
  const expired = attemptStatus(quiz, attempt, submittedAt) === 'expired'
  const questions = await quizRepository.questionsWithAnswers(quiz.id)
  const questionIds = new Set(questions.map((q) => q.id))

  const answers: Record<string, string[]> = {}
  if (!expired) {
    for (const [questionId, optionIds] of Object.entries(input.answers)) {
      if (!questionIds.has(questionId)) throw errors.unprocessable('An answer refers to a question that is not in this quiz.')
      answers[questionId] = [...new Set(optionIds)]
    }
  }

  const { score, correctCount } = scoreAnswers(questions, answers)
  const finalized = await quizRepository.finalizeAttempt(attempt.id, { answers, score, submittedAt })
  if (!finalized) throw errors.conflict('This attempt has already been submitted.', 'ALREADY_SUBMITTED')

  return {
    attemptId: attempt.id,
    score,
    totalMarks: questions.reduce((sum, q) => sum + q.marks, 0),
    correctCount,
    questionCount: questions.length,
    submittedAt: finalized.submittedAt,
    expired,
  }
}

export async function results(ctx: RequestContext, quizId: string, query: z.infer<typeof resultsQuery>) {
  const quiz = await loadQuiz(quizId)
  await assertCanManage(ctx.user, quiz.courseId)
  const [{ rows, total }, stats] = await Promise.all([
    quizRepository.attemptsRoster(quiz.courseId, quiz.id, query),
    quizRepository.questionStats([quiz.id]),
  ])
  return {
    data: rows.map((r) => ({
      student: r.student,
      attempt: r.attempt ? presentAttempt(quiz, r.attempt) : null,
    })),
    meta: { ...pageMeta(query, total), totalMarks: stats.get(quiz.id)?.totalMarks ?? 0 },
  }
}
