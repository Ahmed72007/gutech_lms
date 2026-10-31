import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as courseRepository from '../src/repositories/course.repository.js'
import * as profileRepository from '../src/repositories/profile.repository.js'
import { app, ARCHIVED_COURSE_ID, bearer, COURSE_ID, OTHER_COURSE_ID, USERS } from './helpers.js'

const course = {
  id: COURSE_ID,
  code: 'CS101',
  title: 'Intro to CS',
  description: null,
  isArchived: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  teachers: [],
  studentCount: 1,
}

const summary = (u: (typeof USERS)[keyof typeof USERS]) => ({ id: u.id, fullName: u.fullName, email: u.email, role: u.role, isActive: u.isActive })

describe('admin courses CRUD', () => {
  it('POST /api/admin/courses creates a course (uppercases the code)', async () => {
    vi.mocked(courseRepository.insert).mockResolvedValue(course)
    const res = await request(app).post('/api/admin/courses').set(bearer('admin')).send({ code: 'cs101', title: 'Intro to CS' })
    expect(res.status).toBe(201)
    expect(courseRepository.insert).toHaveBeenCalledWith(expect.objectContaining({ code: 'CS101' }))
  })

  it('GET /api/admin/courses lists with pagination', async () => {
    vi.mocked(courseRepository.list).mockResolvedValue({ rows: [course], total: 1 })
    const res = await request(app).get('/api/admin/courses?archived=all').set(bearer('admin'))
    expect(res.status).toBe(200)
    expect(res.body.meta.total).toBe(1)
  })

  it('PATCH /api/admin/courses/:id archives instead of deleting', async () => {
    vi.mocked(courseRepository.update).mockResolvedValue({ ...course, isArchived: true })
    const res = await request(app).patch(`/api/admin/courses/${COURSE_ID}`).set(bearer('admin')).send({ isArchived: true })
    expect(res.status).toBe(200)
    expect(res.body.data.isArchived).toBe(true)
  })

  it('is admin-only (403 for teachers)', async () => {
    expect((await request(app).post('/api/admin/courses').set(bearer('teacher')).send({ code: 'CS102', title: 'Next' })).status).toBe(403)
    expect((await request(app).get('/api/admin/courses').set(bearer('student'))).status).toBe(403)
  })
})

describe('PUT /api/admin/courses/:id/teachers', () => {
  it('replaces the teacher set', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(profileRepository.findSummaries).mockResolvedValue([summary(USERS.teacher)])
    const res = await request(app).put(`/api/admin/courses/${COURSE_ID}/teachers`).set(bearer('admin')).send({ teacherIds: [USERS.teacher.id] })
    expect(res.status).toBe(200)
    expect(courseRepository.replaceTeachers).toHaveBeenCalledWith(COURSE_ID, [USERS.teacher.id])
  })

  it('rejects non-teachers (422)', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(profileRepository.findSummaries).mockResolvedValue([summary(USERS.student)])
    const res = await request(app).put(`/api/admin/courses/${COURSE_ID}/teachers`).set(bearer('admin')).send({ teacherIds: [USERS.student.id] })
    expect(res.status).toBe(422)
  })

  it('is forbidden for teachers (403)', async () => {
    expect((await request(app).put(`/api/admin/courses/${COURSE_ID}/teachers`).set(bearer('teacher')).send({ teacherIds: [] })).status).toBe(403)
  })
})

describe('POST /api/admin/courses/:id/enrollments', () => {
  it('is idempotent: enrolling an already-enrolled student is not an error', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(profileRepository.findSummaries).mockResolvedValue([summary(USERS.student)])
    vi.mocked(courseRepository.enrolledStudentIds).mockResolvedValue(new Set([USERS.student.id]))
    const res = await request(app).post(`/api/admin/courses/${COURSE_ID}/enrollments`).set(bearer('admin')).send({ studentIds: [USERS.student.id] })
    expect(res.status).toBe(201)
    expect(res.body.data.alreadyEnrolled).toEqual([USERS.student.email])
    expect(courseRepository.addEnrollments).not.toHaveBeenCalled()
  })

  it('CSV import reports matched, duplicate and unknown emails', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(profileRepository.findSummaries).mockResolvedValue([summary(USERS.otherStudent)])
    vi.mocked(courseRepository.enrolledStudentIds).mockResolvedValue(new Set())
    vi.mocked(courseRepository.addEnrollments).mockResolvedValue(1)
    const csv = `email\n${USERS.otherStudent.email}\n${USERS.otherStudent.email}\nghost@gutech.example\n`
    const res = await request(app)
      .post(`/api/admin/courses/${COURSE_ID}/enrollments`)
      .set(bearer('admin'))
      .attach('file', Buffer.from(csv), { filename: 'students.csv', contentType: 'text/csv' })
    expect(res.status).toBe(201)
    expect(res.body.data).toMatchObject({
      enrolled: 1,
      duplicates: [USERS.otherStudent.email],
      unknown: ['ghost@gutech.example'],
    })
    expect(res.body.data.matched).toHaveLength(1)
  })

  it('dryRun previews without writing', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(profileRepository.findSummaries).mockResolvedValue([summary(USERS.otherStudent)])
    vi.mocked(courseRepository.enrolledStudentIds).mockResolvedValue(new Set())
    const res = await request(app)
      .post(`/api/admin/courses/${COURSE_ID}/enrollments?dryRun=true`)
      .set(bearer('admin'))
      .send({ studentIds: [USERS.otherStudent.id] })
    expect(res.status).toBe(200)
    expect(courseRepository.addEnrollments).not.toHaveBeenCalled()
  })

  it('is forbidden for teachers (403)', async () => {
    expect((await request(app).post(`/api/admin/courses/${COURSE_ID}/enrollments`).set(bearer('teacher')).send({ studentIds: [USERS.student.id] })).status).toBe(403)
  })
})

describe('DELETE /api/admin/courses/:id/enrollments/:studentId', () => {
  it('unenrolls (204)', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(courseRepository.removeEnrollment).mockResolvedValue(true)
    expect((await request(app).delete(`/api/admin/courses/${COURSE_ID}/enrollments/${USERS.student.id}`).set(bearer('admin'))).status).toBe(204)
  })

  it('is forbidden for students (403)', async () => {
    expect((await request(app).delete(`/api/admin/courses/${COURSE_ID}/enrollments/${USERS.student.id}`).set(bearer('student'))).status).toBe(403)
  })
})

describe('GET /api/admin/courses/:id/enrollments', () => {
  it('lists the roster', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    vi.mocked(courseRepository.listRoster).mockResolvedValue({ rows: [], total: 0 })
    expect((await request(app).get(`/api/admin/courses/${COURSE_ID}/enrollments`).set(bearer('admin'))).status).toBe(200)
  })

  it('is forbidden for teachers (403)', async () => {
    expect((await request(app).get(`/api/admin/courses/${COURSE_ID}/enrollments`).set(bearer('teacher'))).status).toBe(403)
  })
})

describe('GET /api/me/courses', () => {
  it('returns only enrolled, non-archived courses for a student', async () => {
    vi.mocked(courseRepository.listByIds).mockResolvedValue([course])
    const res = await request(app).get('/api/me/courses').set(bearer('student'))
    expect(res.status).toBe(200)
    const ids = vi.mocked(courseRepository.listByIds).mock.calls[0]?.[1]
    expect(ids).toEqual([COURSE_ID])
    expect(ids).not.toContain(ARCHIVED_COURSE_ID)
  })

  it('returns taught classes for a teacher', async () => {
    vi.mocked(courseRepository.listByIds).mockResolvedValue([course])
    expect((await request(app).get('/api/me/courses').set(bearer('teacher'))).status).toBe(200)
  })

  it('is not for admins (403)', async () => {
    expect((await request(app).get('/api/me/courses').set(bearer('admin'))).status).toBe(403)
  })
})

describe('GET /api/courses/:id', () => {
  it('lets members view the course', async () => {
    vi.mocked(courseRepository.findById).mockResolvedValue(course)
    const res = await request(app).get(`/api/courses/${COURSE_ID}`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data.viewer).toEqual({ canManage: false, isTeacher: false, isStudent: true })
  })

  it('forbids non-members (403) and hides archived courses from students', async () => {
    expect((await request(app).get(`/api/courses/${OTHER_COURSE_ID}`).set(bearer('student'))).status).toBe(403)
    expect((await request(app).get(`/api/courses/${ARCHIVED_COURSE_ID}`).set(bearer('student'))).status).toBe(403)
  })

  it('returns 404 for unknown courses and 422 for malformed ids', async () => {
    expect((await request(app).get('/api/courses/99999999-0000-4000-8000-000000000000').set(bearer('admin'))).status).toBe(404)
    expect((await request(app).get('/api/courses/not-a-uuid').set(bearer('admin'))).status).toBe(422)
  })
})

describe('GET /api/courses/:id/members', () => {
  it('hides classmate emails from students', async () => {
    vi.mocked(courseRepository.members).mockResolvedValue([
      { id: USERS.teacher.id, fullName: 'T', email: 't@x', rollNo: null, role: 'teacher' },
      { id: USERS.student.id, fullName: 'S', email: 's@x', rollNo: 'S1', role: 'student' },
    ])
    const res = await request(app).get(`/api/courses/${COURSE_ID}/members`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data[1].email).toBe('')
  })

  it('forbids a teacher of another course (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/members`).set(bearer('otherTeacher'))).status).toBe(403)
  })
})
