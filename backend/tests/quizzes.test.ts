import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as quizRepository from '../src/repositories/quiz.repository.js'
import type { Attempt, Quiz } from '../src/repositories/quiz.repository.js'
import { DbError } from '../src/utils/db.js'
import { app, bearer, COURSE_ID, USERS } from './helpers.js'

const QUIZ_ID = '50000000-0000-4000-8000-000000000001'
const Q1 = '51000000-0000-4000-8000-000000000001'
const Q2 = '51000000-0000-4000-8000-000000000002'
const Q3 = '51000000-0000-4000-8000-000000000003'

const quiz = (extra: Partial<Quiz> = {}): Quiz => ({
  id: QUIZ_ID,
  courseId: COURSE_ID,
  createdBy: USERS.teacher.id,
  title: 'Week 1',
  description: null,
  timeLimitMinutes: 10,
  opensAt: '2026-05-01T00:00:00.000Z',
  closesAt: '2026-05-31T00:00:00.000Z',
  isPublished: true,
  shuffleQuestions: false,
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-01T00:00:00.000Z',
  ...extra,
})

const questions = [
  { id: Q1, position: 1, type: 'mcq_single' as const, prompt: 'CPU?', options: [{ id: 'a', text: 'CPU' }, { id: 'b', text: 'SSD' }], marks: 2, correctOptionIds: ['a'] },
  { id: Q2, position: 2, type: 'mcq_multi' as const, prompt: 'Langs?', options: [{ id: 'a', text: 'Py' }, { id: 'b', text: 'HTML' }, { id: 'c', text: 'TS' }], marks: 3, correctOptionIds: ['a', 'c'] },
  { id: Q3, position: 3, type: 'true_false' as const, prompt: 'Base 2?', options: [{ id: 'true', text: 'True' }, { id: 'false', text: 'False' }], marks: 1, correctOptionIds: ['true'] },
]
const publicQuestions = questions.map(({ correctOptionIds: _c, ...q }) => q)

const attempt = (extra: Partial<Attempt> = {}): Attempt => ({
  id: '52000000-0000-4000-8000-000000000001',
  quizId: QUIZ_ID,
  studentId: USERS.student.id,
  startedAt: '2026-05-10T10:00:00.000Z',
  submittedAt: null,
  answers: {},
  score: null,
  ...extra,
})

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

const createBody = {
  title: 'Week 1',
  timeLimitMinutes: 10,
  opensAt: '2026-05-01T00:00:00.000Z',
  closesAt: '2026-05-31T00:00:00.000Z',
  questions: questions.map(({ id: _i, position: _p, ...q }) => q),
}

describe('POST /api/courses/:id/quizzes', () => {
  it('creates a quiz with questions and answer key', async () => {
    vi.mocked(quizRepository.insert).mockResolvedValue(quiz({ isPublished: false }))
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.attemptCounts).mockResolvedValue(new Map())
    const res = await request(app).post(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('teacher')).send(createBody)
    expect(res.status).toBe(201)
    expect(res.body.data.totalMarks).toBe(6)
    expect(quizRepository.saveQuestions).toHaveBeenCalledWith(QUIZ_ID, expect.any(Array))
  })

  it('validates single-answer questions have exactly one correct option (422)', async () => {
    const bad = { ...createBody, questions: [{ ...createBody.questions[0], correctOptionIds: ['a', 'b'] }] }
    expect((await request(app).post(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('teacher')).send(bad)).status).toBe(422)
  })

  it('forbids other teachers and students (403)', async () => {
    expect((await request(app).post(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('otherTeacher')).send(createBody)).status).toBe(403)
    expect((await request(app).post(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('student')).send(createBody)).status).toBe(403)
  })
})

describe('PATCH /api/quizzes/:id', () => {
  it('allows publishing even after attempts exist', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz({ isPublished: false }))
    vi.mocked(quizRepository.update).mockResolvedValue(quiz())
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.attemptCounts).mockResolvedValue(new Map([[QUIZ_ID, 3]]))
    expect((await request(app).patch(`/api/quizzes/${QUIZ_ID}`).set(bearer('teacher')).send({ isPublished: true })).status).toBe(200)
  })

  it('blocks content edits once any attempt exists (409)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.attemptCounts).mockResolvedValue(new Map([[QUIZ_ID, 1]]))
    const res = await request(app).patch(`/api/quizzes/${QUIZ_ID}`).set(bearer('teacher')).send({ title: 'Changed title' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('QUIZ_LOCKED')
  })

  it('forbids other teachers (403)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    expect((await request(app).patch(`/api/quizzes/${QUIZ_ID}`).set(bearer('otherTeacher')).send({ isPublished: false })).status).toBe(403)
  })
})

describe('GET /api/courses/:id/quizzes', () => {
  it('shows students published quizzes with their attempt status', async () => {
    at('2026-05-10T10:05:00.000Z')
    vi.mocked(quizRepository.listForCourse).mockResolvedValue({ rows: [quiz()], total: 1 })
    vi.mocked(quizRepository.questionStats).mockResolvedValue(new Map([[QUIZ_ID, { count: 3, totalMarks: 6 }]]))
    vi.mocked(quizRepository.ownAttempts).mockResolvedValue(new Map([[QUIZ_ID, attempt()]]))
    const res = await request(app).get(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(vi.mocked(quizRepository.listForCourse).mock.calls[0]?.[2]).toBe(true) // published only
    expect(res.body.data[0]).toMatchObject({ window: 'open', myAttempt: { status: 'in_progress' } })
  })

  it('forbids non-enrolled students (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/quizzes`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('POST /api/quizzes/:id/attempt', () => {
  it('starts an attempt and never includes the answer key', async () => {
    at('2026-05-10T10:00:00.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(null)
    vi.mocked(quizRepository.insertAttempt).mockResolvedValue(attempt())
    vi.mocked(quizRepository.publicQuestions).mockResolvedValue(publicQuestions)
    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('student'))
    expect(res.status).toBe(201)
    expect(res.body.data.expiresAt).toBe('2026-05-10T10:10:00.000Z')
    expect(JSON.stringify(res.body)).not.toMatch(/correct/i)
    expect(quizRepository.questionsWithAnswers).not.toHaveBeenCalled()
  })

  it('rejects a second attempt (409)', async () => {
    at('2026-05-10T11:00:00.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(attempt({ submittedAt: '2026-05-10T10:05:00.000Z', score: 4 }))
    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('student'))
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('ALREADY_ATTEMPTED')
  })

  it('maps a concurrent duplicate insert to 409', async () => {
    at('2026-05-10T10:00:00.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(null)
    vi.mocked(quizRepository.insertAttempt).mockRejectedValue(new DbError('23505', 'duplicate'))
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('student'))).status).toBe(409)
  })

  it('rejects quizzes outside their window (409)', async () => {
    at('2026-06-10T10:00:00.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(null)
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('student'))).body.error.code).toBe('QUIZ_CLOSED')
  })

  it('forbids teachers and non-enrolled students (403)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('teacher'))).status).toBe(403)
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('POST /api/quizzes/:id/attempt/submit', () => {
  it('auto-grades on the server; multi-select is all-or-nothing', async () => {
    at('2026-05-10T10:08:00.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(attempt())
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.finalizeAttempt).mockImplementation(async (_id, input) => attempt({ ...input, submittedAt: input.submittedAt.toISOString() }))
    // Q1 correct (2), Q2 partially correct (0), Q3 correct (1) => 3
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/attempt/submit`)
      .set(bearer('student'))
      .send({ answers: { [Q1]: ['a'], [Q2]: ['a'], [Q3]: ['true'] } })
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ score: 3, totalMarks: 6, correctCount: 2, expired: false })
  })

  it('scores 0 for unanswered once the time limit + 10 s grace has passed', async () => {
    at('2026-05-10T10:10:11.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(attempt())
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.finalizeAttempt).mockImplementation(async (_id, input) => attempt({ ...input, submittedAt: input.submittedAt.toISOString() }))
    const res = await request(app)
      .post(`/api/quizzes/${QUIZ_ID}/attempt/submit`)
      .set(bearer('student'))
      .send({ answers: { [Q1]: ['a'], [Q3]: ['true'] } })
    expect(res.body.data).toMatchObject({ score: 0, expired: true })
  })

  it('accepts a submission within the 10 s grace period', async () => {
    at('2026-05-10T10:10:09.000Z')
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(attempt())
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.finalizeAttempt).mockImplementation(async (_id, input) => attempt({ ...input, submittedAt: input.submittedAt.toISOString() }))
    const res = await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt/submit`).set(bearer('student')).send({ answers: { [Q3]: ['true'] } })
    expect(res.body.data).toMatchObject({ score: 1, expired: false })
  })

  it('rejects double submission (409)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(attempt({ submittedAt: '2026-05-10T10:05:00.000Z' }))
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt/submit`).set(bearer('student')).send({ answers: {} })).status).toBe(409)
  })

  it('forbids teachers (403)', async () => {
    expect((await request(app).post(`/api/quizzes/${QUIZ_ID}/attempt/submit`).set(bearer('teacher')).send({ answers: {} })).status).toBe(403)
  })
})

describe('GET /api/quizzes/:id', () => {
  it('gives teachers the answer key for the builder', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.questionsWithAnswers).mockResolvedValue(questions)
    vi.mocked(quizRepository.attemptCounts).mockResolvedValue(new Map())
    const res = await request(app).get(`/api/quizzes/${QUIZ_ID}`).set(bearer('teacher'))
    expect(res.body.data.questions[0].correctOptionIds).toEqual(['a'])
  })

  it('never gives students questions or answers outside an attempt', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.questionStats).mockResolvedValue(new Map([[QUIZ_ID, { count: 3, totalMarks: 6 }]]))
    vi.mocked(quizRepository.findAttempt).mockResolvedValue(null)
    const res = await request(app).get(`/api/quizzes/${QUIZ_ID}`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data.questions).toBeUndefined()
    expect(JSON.stringify(res.body)).not.toMatch(/correct/i)
  })

  it('hides unpublished quizzes from students (404)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz({ isPublished: false }))
    expect((await request(app).get(`/api/quizzes/${QUIZ_ID}`).set(bearer('student'))).status).toBe(404)
  })
})

describe('GET /api/quizzes/:id/results', () => {
  it('lists attempts and scores for the teacher', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.attemptsRoster).mockResolvedValue({ rows: [], total: 0 })
    vi.mocked(quizRepository.questionStats).mockResolvedValue(new Map())
    expect((await request(app).get(`/api/quizzes/${QUIZ_ID}/results`).set(bearer('teacher'))).status).toBe(200)
  })

  it('forbids students (403)', async () => {
    expect((await request(app).get(`/api/quizzes/${QUIZ_ID}/results`).set(bearer('student'))).status).toBe(403)
  })
})

describe('DELETE /api/quizzes/:id', () => {
  it('deletes a quiz without attempts', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    vi.mocked(quizRepository.attemptCounts).mockResolvedValue(new Map())
    expect((await request(app).delete(`/api/quizzes/${QUIZ_ID}`).set(bearer('teacher'))).status).toBe(204)
  })

  it('forbids other teachers (403)', async () => {
    vi.mocked(quizRepository.findById).mockResolvedValue(quiz())
    expect((await request(app).delete(`/api/quizzes/${QUIZ_ID}`).set(bearer('otherTeacher'))).status).toBe(403)
  })
})
