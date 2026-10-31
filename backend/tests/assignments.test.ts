import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as assignmentRepository from '../src/repositories/assignment.repository.js'
import type { Assignment, Submission } from '../src/repositories/assignment.repository.js'
import * as auditRepository from '../src/repositories/audit.repository.js'
import { app, bearer, COURSE_ID, FILES, USERS } from './helpers.js'

const ASSIGNMENT_ID = '40000000-0000-4000-8000-000000000001'
const SUBMISSION_ID = '70000000-0000-4000-8000-000000000001'
const DUE = '2026-06-01T12:00:00.000Z'

const assignment = (extra: Partial<Assignment> = {}): Assignment => ({
  id: ASSIGNMENT_ID,
  courseId: COURSE_ID,
  createdBy: USERS.teacher.id,
  title: 'Problem set 1',
  instructions: 'Solve it',
  maxMarks: 20,
  dueAt: DUE,
  allowLate: false,
  attachmentPath: null,
  attachmentName: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  ...extra,
})

const submission = (extra: Partial<Submission> = {}): Submission => ({
  id: SUBMISSION_ID,
  assignmentId: ASSIGNMENT_ID,
  studentId: USERS.student.id,
  textAnswer: 'My answer',
  filePath: null,
  fileName: null,
  submittedAt: '2026-05-20T00:00:00.000Z',
  isLate: false,
  marksObtained: null,
  feedback: null,
  gradedAt: null,
  gradedBy: null,
  ...extra,
})

function at(iso: string) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(iso))
}

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/courses/:id/assignments', () => {
  it('creates an assignment for a course teacher', async () => {
    at('2026-05-01T00:00:00.000Z')
    vi.mocked(assignmentRepository.insert).mockResolvedValue(assignment())
    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/assignments`)
      .set(bearer('teacher'))
      .send({ title: 'Problem set 1', instructions: 'Solve it', maxMarks: 20, dueAt: DUE })
    expect(res.status).toBe(201)
    expect(res.body.data.attachmentPath).toBeUndefined()
  })

  it('accepts an optional attachment via multipart', async () => {
    at('2026-05-01T00:00:00.000Z')
    vi.mocked(assignmentRepository.insert).mockResolvedValue(assignment({ attachmentPath: 'p', attachmentName: 'brief.pdf' }))
    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/assignments`)
      .set(bearer('teacher'))
      .field('title', 'Problem set 1')
      .field('instructions', 'Solve it')
      .field('maxMarks', '20')
      .field('dueAt', DUE)
      .field('allowLate', 'true')
      .attach('attachment', FILES.pdf, 'brief.pdf')
    expect(res.status).toBe(201)
    expect(vi.mocked(assignmentRepository.insert).mock.calls[0]?.[2]).toMatchObject({ allowLate: true, maxMarks: 20 })
  })

  it('forbids teachers of other courses and students (403)', async () => {
    const body = { title: 'X title', instructions: 'Y', maxMarks: 5, dueAt: DUE }
    expect((await request(app).post(`/api/courses/${COURSE_ID}/assignments`).set(bearer('otherTeacher')).send(body)).status).toBe(403)
    expect((await request(app).post(`/api/courses/${COURSE_ID}/assignments`).set(bearer('student')).send(body)).status).toBe(403)
  })
})

describe('GET /api/courses/:id/assignments', () => {
  it('shows a student their own submission status', async () => {
    vi.mocked(assignmentRepository.listForCourse).mockResolvedValue({ rows: [assignment()], total: 1 })
    vi.mocked(assignmentRepository.ownSubmissions).mockResolvedValue(new Map([[ASSIGNMENT_ID, submission({ gradedAt: '2026-05-21', marksObtained: 15 })]]))
    const res = await request(app).get(`/api/courses/${COURSE_ID}/assignments`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data[0].status).toBe('graded')
    expect(vi.mocked(assignmentRepository.ownSubmissions).mock.calls[0]?.[1]).toBe(USERS.student.id)
  })

  it('forbids non-enrolled students (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/assignments`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('GET /api/assignments/:id', () => {
  it('returns detail with my submission for students', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.findSubmission).mockResolvedValue(null)
    const res = await request(app).get(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('pending')
  })

  it('forbids non-members (403)', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    expect((await request(app).get(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('PATCH / DELETE /api/assignments/:id', () => {
  it('lets the course teacher edit', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.update).mockResolvedValue(assignment({ title: 'Renamed' }))
    const res = await request(app).patch(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('teacher')).send({ title: 'Renamed' })
    expect(res.status).toBe(200)
    expect(res.body.data.title).toBe('Renamed')
  })

  it('refuses to lower max marks below an existing grade (409)', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.highestGrade).mockResolvedValue(18)
    expect((await request(app).patch(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('teacher')).send({ maxMarks: 10 })).status).toBe(409)
  })

  it('deletes with audit for the teacher, forbids others', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.submissionFilePaths).mockResolvedValue([])
    expect((await request(app).delete(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('otherTeacher'))).status).toBe(403)
    expect((await request(app).delete(`/api/assignments/${ASSIGNMENT_ID}`).set(bearer('teacher'))).status).toBe(204)
    expect(auditRepository.record).toHaveBeenCalledWith(USERS.teacher.id, 'assignment.delete', 'assignment', ASSIGNMENT_ID)
  })
})

describe('GET /api/assignments/:id/attachment', () => {
  it('returns a signed URL to members', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment({ attachmentPath: 'a/b.pdf', attachmentName: 'b.pdf' }))
    expect((await request(app).get(`/api/assignments/${ASSIGNMENT_ID}/attachment`).set(bearer('student'))).status).toBe(200)
  })

  it('forbids non-members (403)', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment({ attachmentPath: 'a/b.pdf' }))
    expect((await request(app).get(`/api/assignments/${ASSIGNMENT_ID}/attachment`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('PUT /api/assignments/:id/submission', () => {
  it('accepts an on-time submission and clears any previous grade', async () => {
    at('2026-05-20T00:00:00.000Z')
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.findSubmission).mockResolvedValue(submission({ marksObtained: 12, gradedAt: '2026-05-19' }))
    vi.mocked(assignmentRepository.upsertSubmission).mockResolvedValue(submission())
    const res = await request(app).put(`/api/assignments/${ASSIGNMENT_ID}/submission`).set(bearer('student')).send({ textAnswer: 'Updated answer' })
    expect(res.status).toBe(200)
    expect(res.body.data.status).toBe('submitted')
    expect(vi.mocked(assignmentRepository.upsertSubmission).mock.calls[0]?.[0]).toMatchObject({ isLate: false, textAnswer: 'Updated answer' })
  })

  it('blocks late submissions when allow_late is false (409), using the server clock', async () => {
    at('2026-06-02T00:00:00.000Z')
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    const res = await request(app).put(`/api/assignments/${ASSIGNMENT_ID}/submission`).set(bearer('student')).send({ textAnswer: 'Late' })
    expect(res.status).toBe(409)
    expect(res.body.error.code).toBe('DEADLINE_PASSED')
  })

  it('flags late submissions when allow_late is true', async () => {
    at('2026-06-02T00:00:00.000Z')
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment({ allowLate: true }))
    vi.mocked(assignmentRepository.findSubmission).mockResolvedValue(null)
    vi.mocked(assignmentRepository.upsertSubmission).mockResolvedValue(submission({ isLate: true }))
    const res = await request(app).put(`/api/assignments/${ASSIGNMENT_ID}/submission`).set(bearer('student')).send({ textAnswer: 'Late' })
    expect(res.status).toBe(200)
    expect(vi.mocked(assignmentRepository.upsertSubmission).mock.calls[0]?.[0].isLate).toBe(true)
  })

  it('forbids teachers and non-enrolled students (403)', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    expect((await request(app).put(`/api/assignments/${ASSIGNMENT_ID}/submission`).set(bearer('teacher')).send({ textAnswer: 'x' })).status).toBe(403)
    expect((await request(app).put(`/api/assignments/${ASSIGNMENT_ID}/submission`).set(bearer('otherStudent')).send({ textAnswer: 'x' })).status).toBe(403)
  })
})

describe('GET /api/assignments/:id/submissions', () => {
  it('lists submissions with student names for the teacher', async () => {
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.roster).mockResolvedValue({
      rows: [{ student: { id: USERS.student.id, fullName: USERS.student.fullName, email: USERS.student.email, rollNo: 'S1' }, submission: submission() }],
      total: 1,
    })
    const res = await request(app).get(`/api/assignments/${ASSIGNMENT_ID}/submissions`).set(bearer('teacher'))
    expect(res.status).toBe(200)
    expect(res.body.data[0].student.fullName).toBe(USERS.student.fullName)
  })

  it('never shows other submissions to a student (403)', async () => {
    expect((await request(app).get(`/api/assignments/${ASSIGNMENT_ID}/submissions`).set(bearer('student'))).status).toBe(403)
  })
})

describe('GET /api/submissions/:id/download', () => {
  it('lets the owner download their file', async () => {
    vi.mocked(assignmentRepository.findSubmissionById).mockResolvedValue(submission({ filePath: 'x/y.pdf', fileName: 'y.pdf' }))
    expect((await request(app).get(`/api/submissions/${SUBMISSION_ID}/download`).set(bearer('student'))).status).toBe(200)
  })

  it("never lets a student read another student's submission (403)", async () => {
    vi.mocked(assignmentRepository.findSubmissionById).mockResolvedValue(submission({ filePath: 'x/y.pdf' }))
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    expect((await request(app).get(`/api/submissions/${SUBMISSION_ID}/download`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('PATCH /api/submissions/:id/grade', () => {
  it('grades and audits', async () => {
    vi.mocked(assignmentRepository.findSubmissionById).mockResolvedValue(submission())
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    vi.mocked(assignmentRepository.grade).mockResolvedValue(submission({ marksObtained: 18, gradedAt: '2026-05-21' }))
    const res = await request(app).patch(`/api/submissions/${SUBMISSION_ID}/grade`).set(bearer('teacher')).send({ marks: 18, feedback: 'Great' })
    expect(res.status).toBe(200)
    expect(auditRepository.record).toHaveBeenCalledWith(USERS.teacher.id, 'submission.grade', 'submission', SUBMISSION_ID)
  })

  it('rejects marks above max_marks (422)', async () => {
    vi.mocked(assignmentRepository.findSubmissionById).mockResolvedValue(submission())
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    expect((await request(app).patch(`/api/submissions/${SUBMISSION_ID}/grade`).set(bearer('teacher')).send({ marks: 21 })).status).toBe(422)
  })

  it('forbids teachers of other courses (403) and students (403)', async () => {
    vi.mocked(assignmentRepository.findSubmissionById).mockResolvedValue(submission())
    vi.mocked(assignmentRepository.findById).mockResolvedValue(assignment())
    expect((await request(app).patch(`/api/submissions/${SUBMISSION_ID}/grade`).set(bearer('otherTeacher')).send({ marks: 5 })).status).toBe(403)
    expect((await request(app).patch(`/api/submissions/${SUBMISSION_ID}/grade`).set(bearer('student')).send({ marks: 5 })).status).toBe(403)
  })
})
