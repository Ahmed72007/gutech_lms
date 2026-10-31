import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as complaintRepository from '../src/repositories/complaint.repository.js'
import type { Complaint } from '../src/repositories/complaint.repository.js'
import * as dashboardRepository from '../src/repositories/dashboard.repository.js'
import * as courseRepository from '../src/repositories/course.repository.js'
import * as notificationRepository from '../src/repositories/notification.repository.js'
import * as profileRepository from '../src/repositories/profile.repository.js'
import * as storage from '../src/repositories/storage.repository.js'
import * as auditRepository from '../src/repositories/audit.repository.js'
import { app, bearer, COURSE_ID, FILES, OTHER_COURSE_ID, USERS } from './helpers.js'

const COMPLAINT_ID = '90000000-0000-4000-8000-000000000001'

const complaint = (extra: Partial<Complaint> = {}): Complaint => ({
  id: COMPLAINT_ID,
  raisedById: USERS.student.id,
  raisedBy: { id: USERS.student.id, fullName: USERS.student.fullName, email: USERS.student.email, role: 'student' },
  course: null,
  category: 'technical',
  subject: 'Wi-Fi down',
  description: 'The lab Wi-Fi has been down all week.',
  attachmentPath: null,
  attachmentName: null,
  status: 'open',
  adminResponse: null,
  resolvedBy: null,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  ...extra,
})

const validComplaint = { category: 'technical', subject: 'Wi-Fi down', description: 'The lab Wi-Fi has been down all week.' }

describe('POST /api/complaints', () => {
  it('files a complaint with an attachment stored in the private bucket', async () => {
    vi.mocked(complaintRepository.insert).mockResolvedValue(complaint({ attachmentPath: 'p', attachmentName: 'shot.png' }))
    const res = await request(app)
      .post('/api/complaints')
      .set(bearer('student'))
      .field('category', 'technical')
      .field('subject', 'Wi-Fi down')
      .field('description', 'The lab Wi-Fi has been down all week.')
      .attach('attachment', FILES.png, 'shot.png')
    expect(res.status).toBe(201)
    expect(vi.mocked(storage.upload).mock.calls[0]?.[0]).toBe('complaint-attachments')
    expect(res.body.data.attachmentPath).toBeUndefined()
    expect(res.body.data.hasAttachment).toBe(true)
  })

  it('rejects linking a course the user is not in (422)', async () => {
    expect((await request(app).post('/api/complaints').set(bearer('student')).send({ ...validComplaint, courseId: OTHER_COURSE_ID })).status).toBe(422)
  })

  it('forbids admins (403)', async () => {
    expect((await request(app).post('/api/complaints').set(bearer('admin')).send(validComplaint)).status).toBe(403)
  })
})

describe('GET /api/complaints/mine and /:id', () => {
  it('lists own complaints', async () => {
    vi.mocked(complaintRepository.listMine).mockResolvedValue({ rows: [complaint()], total: 1 })
    const res = await request(app).get('/api/complaints/mine').set(bearer('student'))
    expect(res.status).toBe(200)
    expect(vi.mocked(complaintRepository.listMine).mock.calls[0]?.[1]).toBe(USERS.student.id)
  })

  it("returns 404 for someone else's complaint", async () => {
    vi.mocked(complaintRepository.findById).mockResolvedValue(complaint())
    expect((await request(app).get(`/api/complaints/${COMPLAINT_ID}`).set(bearer('otherStudent'))).status).toBe(404)
    expect((await request(app).get(`/api/complaints/${COMPLAINT_ID}/attachment`).set(bearer('otherStudent'))).status).toBe(404)
  })

  it('lets the owner download the attachment via a signed URL', async () => {
    vi.mocked(complaintRepository.findById).mockResolvedValue(complaint({ attachmentPath: 'x/shot.png', attachmentName: 'shot.png' }))
    const res = await request(app).get(`/api/complaints/${COMPLAINT_ID}/attachment`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data.url).toMatch(/^https:\/\/storage\.test\/signed\//)
  })
})

describe('admin complaints', () => {
  it('GET /api/admin/complaints filters the queue', async () => {
    vi.mocked(complaintRepository.listAll).mockResolvedValue({ rows: [complaint()], total: 1 })
    const res = await request(app).get('/api/admin/complaints?status=open&category=technical').set(bearer('admin'))
    expect(res.status).toBe(200)
    expect(complaintRepository.listAll).toHaveBeenCalledWith({ status: 'open', category: 'technical', search: undefined }, expect.anything())
  })

  it('PATCH moves open → in_review and notifies the complainant', async () => {
    vi.mocked(complaintRepository.findById).mockResolvedValue(complaint())
    vi.mocked(complaintRepository.updateStatus).mockResolvedValue(complaint({ status: 'in_review' }))
    const res = await request(app).patch(`/api/admin/complaints/${COMPLAINT_ID}`).set(bearer('admin')).send({ status: 'in_review' })
    expect(res.status).toBe(200)
    expect(notificationRepository.create).toHaveBeenCalledWith(USERS.student.id, expect.objectContaining({ kind: 'complaint_status' }))
    expect(auditRepository.record).toHaveBeenCalled()
  })

  it('requires a response when resolving (422)', async () => {
    vi.mocked(complaintRepository.findById).mockResolvedValue(complaint({ status: 'in_review' }))
    const res = await request(app).patch(`/api/admin/complaints/${COMPLAINT_ID}`).set(bearer('admin')).send({ status: 'resolved' })
    expect(res.status).toBe(422)
  })

  it('rejects invalid transitions (409)', async () => {
    vi.mocked(complaintRepository.findById).mockResolvedValue(complaint({ status: 'resolved', adminResponse: 'done' }))
    expect((await request(app).patch(`/api/admin/complaints/${COMPLAINT_ID}`).set(bearer('admin')).send({ status: 'open' })).status).toBe(409)
  })

  it('is admin-only (403)', async () => {
    expect((await request(app).get('/api/admin/complaints').set(bearer('teacher'))).status).toBe(403)
    expect((await request(app).patch(`/api/admin/complaints/${COMPLAINT_ID}`).set(bearer('student')).send({ status: 'in_review' })).status).toBe(403)
  })
})

describe('notifications', () => {
  it('lists, counts and marks read for the signed-in user', async () => {
    vi.mocked(notificationRepository.list).mockResolvedValue({ rows: [], total: 0 })
    vi.mocked(notificationRepository.unreadCount).mockResolvedValue(1)
    expect((await request(app).get('/api/notifications').set(bearer('student'))).status).toBe(200)
    expect((await request(app).get('/api/notifications/unread-count').set(bearer('student'))).body.data.count).toBe(1)
    expect((await request(app).post('/api/notifications/read').set(bearer('student')).send({})).status).toBe(200)
  })

  it('requires authentication (401)', async () => {
    expect((await request(app).get('/api/notifications')).status).toBe(401)
  })
})

describe('profile', () => {
  it('GET /api/profile returns the own profile', async () => {
    const res = await request(app).get('/api/profile').set(bearer('teacher'))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ id: USERS.teacher.id, avatarUrl: null })
  })

  it('PATCH /api/profile updates descriptive fields only', async () => {
    vi.mocked(profileRepository.updateOwn).mockResolvedValue({ ...USERS.teacher, phone: '+968 9123 4567', bio: 'Hi' })
    const res = await request(app).patch('/api/profile').set(bearer('teacher')).send({ phone: '+968 9123 4567', bio: 'Hi' })
    expect(res.status).toBe(200)
    expect(vi.mocked(profileRepository.updateOwn).mock.calls[0]?.[2]).toEqual({ phone: '+968 9123 4567', bio: 'Hi' })
  })

  it('PATCH /api/profile ignores attempts to change role', async () => {
    vi.mocked(profileRepository.updateOwn).mockResolvedValue(USERS.student)
    await request(app).patch('/api/profile').set(bearer('student')).send({ bio: 'x', role: 'admin', isActive: true })
    expect(vi.mocked(profileRepository.updateOwn).mock.calls[0]?.[2]).toEqual({ bio: 'x' })
  })

  it('POST /api/profile/avatar accepts images and rejects other files (422)', async () => {
    vi.mocked(profileRepository.updateOwn).mockResolvedValue({ ...USERS.student, avatarPath: 'p.png' })
    expect((await request(app).post('/api/profile/avatar').set(bearer('student')).attach('avatar', FILES.png, 'me.png')).status).toBe(200)
    expect((await request(app).post('/api/profile/avatar').set(bearer('student')).attach('avatar', FILES.pdf, 'me.pdf')).status).toBe(422)
  })

  it('DELETE /api/profile/avatar removes it', async () => {
    vi.mocked(profileRepository.updateOwn).mockResolvedValue(USERS.student)
    expect((await request(app).delete('/api/profile/avatar').set(bearer('student'))).status).toBe(200)
  })

  it('requires authentication (401)', async () => {
    expect((await request(app).get('/api/profile')).status).toBe(401)
    expect((await request(app).patch('/api/profile').send({ bio: 'x' })).status).toBe(401)
  })
})

describe('GET /api/me/dashboard', () => {
  it('returns a role-specific summary for students', async () => {
    vi.mocked(courseRepository.listByIds).mockResolvedValue([])
    vi.mocked(dashboardRepository.upcomingAssignments).mockResolvedValue([])
    vi.mocked(dashboardRepository.openQuizzes).mockResolvedValue([])
    vi.mocked(dashboardRepository.studentMarkRows).mockResolvedValue([])
    vi.mocked(dashboardRepository.submittedAssignmentIds).mockResolvedValue(new Set())
    vi.mocked(dashboardRepository.attemptedQuizIds).mockResolvedValue(new Set())
    const res = await request(app).get('/api/me/dashboard').set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data.role).toBe('student')
    expect(vi.mocked(courseRepository.listByIds).mock.calls[0]?.[1]).toEqual([COURSE_ID])
  })

  it('returns admin stats for admins', async () => {
    vi.mocked(profileRepository.countByRole).mockResolvedValue({ admin: 1, teacher: 2, student: 5 })
    vi.mocked(courseRepository.countActive).mockResolvedValue(3)
    vi.mocked(complaintRepository.countOpen).mockResolvedValue(1)
    vi.mocked(auditRepository.list).mockResolvedValue({ rows: [], total: 0 })
    vi.mocked(complaintRepository.listAll).mockResolvedValue({ rows: [], total: 0 })
    const res = await request(app).get('/api/me/dashboard').set(bearer('admin'))
    expect(res.body.data).toMatchObject({ role: 'admin', activeCourses: 3, openComplaints: 1 })
  })

  it('requires authentication (401)', async () => {
    expect((await request(app).get('/api/me/dashboard')).status).toBe(401)
  })
})

describe('GET /api/admin/audit-log', () => {
  it('is visible to admins', async () => {
    vi.mocked(auditRepository.list).mockResolvedValue({ rows: [], total: 0 })
    expect((await request(app).get('/api/admin/audit-log').set(bearer('admin'))).status).toBe(200)
  })

  it('is forbidden for teachers (403)', async () => {
    expect((await request(app).get('/api/admin/audit-log').set(bearer('teacher'))).status).toBe(403)
  })
})
