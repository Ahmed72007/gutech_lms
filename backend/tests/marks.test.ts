import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as marksRepository from '../src/repositories/marks.repository.js'
import { app, bearer, COURSE_ID, USERS } from './helpers.js'

const items = [
  { id: 'a1', kind: 'assignment' as const, title: 'PS1', max: 20, dueAt: '2026-05-01' },
  { id: 'q1', kind: 'quiz' as const, title: 'Quiz 1', max: 6, dueAt: '2026-05-02' },
  { id: 'a2', kind: 'assignment' as const, title: 'PS2, "hard"', max: 10, dueAt: '2026-05-03' },
]

describe('GET /api/me/marks', () => {
  it('returns own marks per course; percentage counts graded items only', async () => {
    vi.mocked(marksRepository.studentMarks).mockResolvedValue([
      { courseId: COURSE_ID, kind: 'assignment', itemId: 'a1', title: 'PS1', obtained: 15, max: 20, gradedAt: '2026-05-02' },
      { courseId: COURSE_ID, kind: 'quiz', itemId: 'q1', title: 'Quiz 1', obtained: 3, max: 6, gradedAt: '2026-05-03' },
      { courseId: COURSE_ID, kind: 'assignment', itemId: 'a2', title: 'PS2', obtained: null, max: 10, gradedAt: null },
    ])
    vi.mocked(marksRepository.coursesByIds).mockResolvedValue([{ id: COURSE_ID, code: 'CS101', title: 'Intro' }])
    const res = await request(app).get('/api/me/marks').set(bearer('student'))
    expect(res.status).toBe(200)
    // (15 + 3) / (20 + 6) * 100 = 69.23; the pending item is excluded.
    expect(res.body.data.courses[0].totals).toMatchObject({ obtained: 18, max: 26, percentage: 69.23, pendingCount: 1 })
    expect(vi.mocked(marksRepository.studentMarks).mock.calls[0]?.[1]).toBe(USERS.student.id)
  })

  it("rejects requests for another student's marks (403)", async () => {
    const res = await request(app).get(`/api/me/marks?studentId=${USERS.otherStudent.id}`).set(bearer('student'))
    expect(res.status).toBe(403)
  })

  it('is student-only (403 for teachers)', async () => {
    expect((await request(app).get('/api/me/marks').set(bearer('teacher'))).status).toBe(403)
  })
})

describe('GET /api/courses/:id/gradebook', () => {
  it('builds a students-by-items matrix with totals', async () => {
    vi.mocked(marksRepository.gradebookItems).mockResolvedValue(items)
    vi.mocked(marksRepository.gradebookStudents).mockResolvedValue({
      rows: [{ id: USERS.student.id, fullName: USERS.student.fullName, email: USERS.student.email, rollNo: 'S1' }],
      total: 1,
    })
    vi.mocked(marksRepository.gradebookCells).mockResolvedValue([
      { itemId: 'a1', studentId: USERS.student.id, obtained: 20, submissionId: 's1', submitted: true },
      { itemId: 'q1', studentId: USERS.student.id, obtained: 4, submissionId: null, submitted: true },
      { itemId: 'a2', studentId: USERS.student.id, obtained: null, submissionId: 's2', submitted: true },
    ])
    const res = await request(app).get(`/api/courses/${COURSE_ID}/gradebook`).set(bearer('teacher'))
    expect(res.status).toBe(200)
    const row = res.body.data.rows[0]
    expect(row.cells.map((c: { status: string }) => c.status)).toEqual(['graded', 'graded', 'pending'])
    expect(row.totals).toMatchObject({ obtained: 24, max: 26, percentage: 92.31 })
  })

  it('forbids teachers of other courses and students (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/gradebook`).set(bearer('otherTeacher'))).status).toBe(403)
    expect((await request(app).get(`/api/courses/${COURSE_ID}/gradebook`).set(bearer('student'))).status).toBe(403)
  })
})

describe('GET /api/courses/:id/gradebook.csv', () => {
  it('exports CSV with a UTF-8 BOM and escaped cells', async () => {
    vi.mocked(marksRepository.gradebookItems).mockResolvedValue(items)
    vi.mocked(marksRepository.gradebookStudents).mockResolvedValue({
      rows: [{ id: USERS.student.id, fullName: 'Noor Saïd', email: 'n@x', rollNo: 'S1' }],
      total: 1,
    })
    vi.mocked(marksRepository.gradebookCells).mockResolvedValue([])
    const res = await request(app).get(`/api/courses/${COURSE_ID}/gradebook.csv`).set(bearer('admin')).buffer(true).parse((r, cb) => {
      const chunks: Buffer[] = []
      r.on('data', (c: Buffer) => chunks.push(c))
      r.on('end', () => cb(null, Buffer.concat(chunks)))
    })
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/csv/)
    const body = res.body as Buffer
    expect([...body.subarray(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(body.toString('utf8')).toContain('"PS2, ""hard"" (/10)"')
    expect(body.toString('utf8')).toContain('Noor Saïd')
  })

  it('forbids students (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/gradebook.csv`).set(bearer('student'))).status).toBe(403)
  })
})
