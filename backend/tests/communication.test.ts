import request from 'supertest'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as announcementRepository from '../src/repositories/announcement.repository.js'
import * as chatRepository from '../src/repositories/chat.repository.js'
import type { ChatMessage } from '../src/repositories/chat.repository.js'
import { app, bearer, COURSE_ID, OTHER_COURSE_ID, USERS } from './helpers.js'

const ANNOUNCEMENT_ID = '30000000-0000-4000-8000-000000000001'
const MESSAGE_ID = '80000000-0000-4000-8000-000000000001'

const announcement = (authorId: string = USERS.teacher.id) => ({
  id: ANNOUNCEMENT_ID,
  courseId: COURSE_ID,
  authorId,
  title: 'Lab moved',
  body: 'Thursday',
  isPinned: false,
  createdAt: '2026-05-01T00:00:00.000Z',
  updatedAt: '2026-05-01T00:00:00.000Z',
  author: null,
  course: null,
  isRead: false,
})

afterEach(() => {
  vi.useRealTimers()
})

describe('POST /api/announcements', () => {
  it('lets a teacher post to their course', async () => {
    vi.mocked(announcementRepository.insert).mockResolvedValue(announcement())
    const res = await request(app).post('/api/announcements').set(bearer('teacher')).send({ courseId: COURSE_ID, title: 'Lab moved', body: 'Thursday' })
    expect(res.status).toBe(201)
  })

  it('lets an admin post globally', async () => {
    vi.mocked(announcementRepository.insert).mockResolvedValue({ ...announcement(USERS.admin.id), courseId: null })
    expect((await request(app).post('/api/announcements').set(bearer('admin')).send({ title: 'Welcome all', body: 'Hi' })).status).toBe(201)
  })

  it('forbids a teacher posting to a course they do not teach, or globally (403)', async () => {
    expect((await request(app).post('/api/announcements').set(bearer('teacher')).send({ courseId: OTHER_COURSE_ID, title: 'Nope', body: 'x' })).status).toBe(403)
    expect((await request(app).post('/api/announcements').set(bearer('teacher')).send({ title: 'Global', body: 'x' })).status).toBe(403)
  })

  it('forbids students (403)', async () => {
    expect((await request(app).post('/api/announcements').set(bearer('student')).send({ courseId: COURSE_ID, title: 'Hey', body: 'x' })).status).toBe(403)
  })
})

describe('GET /api/announcements', () => {
  it('returns the RLS-scoped feed (global + own courses)', async () => {
    vi.mocked(announcementRepository.feed).mockResolvedValue({ rows: [announcement()], total: 1 })
    const res = await request(app).get('/api/announcements').set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.meta.total).toBe(1)
  })

  it('forbids filtering by a course the student is not in (403)', async () => {
    expect((await request(app).get(`/api/announcements?courseId=${OTHER_COURSE_ID}`).set(bearer('student'))).status).toBe(403)
  })
})

describe('PATCH / DELETE /api/announcements/:id', () => {
  it('lets the author edit', async () => {
    vi.mocked(announcementRepository.findById).mockResolvedValue(announcement())
    vi.mocked(announcementRepository.update).mockResolvedValue(announcement())
    expect((await request(app).patch(`/api/announcements/${ANNOUNCEMENT_ID}`).set(bearer('teacher')).send({ isPinned: true })).status).toBe(200)
  })

  it('forbids other teachers (403); admin can delete', async () => {
    vi.mocked(announcementRepository.findById).mockResolvedValue(announcement())
    expect((await request(app).delete(`/api/announcements/${ANNOUNCEMENT_ID}`).set(bearer('otherTeacher'))).status).toBe(403)
    expect((await request(app).delete(`/api/announcements/${ANNOUNCEMENT_ID}`).set(bearer('admin'))).status).toBe(204)
  })
})

describe('announcement read receipts', () => {
  it('POST /api/announcements/read marks up to a timestamp', async () => {
    vi.mocked(announcementRepository.markRead).mockResolvedValue(4)
    const res = await request(app).post('/api/announcements/read').set(bearer('student')).send({ before: '2026-05-02T00:00:00.000Z' })
    expect(res.status).toBe(200)
    expect(res.body.data.marked).toBe(4)
  })

  it('GET /api/announcements/unread-count works for any signed-in user', async () => {
    vi.mocked(announcementRepository.unreadCount).mockResolvedValue(2)
    expect((await request(app).get('/api/announcements/unread-count').set(bearer('teacher'))).body.data.count).toBe(2)
  })

  it('both require authentication (401)', async () => {
    expect((await request(app).post('/api/announcements/read')).status).toBe(401)
    expect((await request(app).get('/api/announcements/unread-count')).status).toBe(401)
  })
})

const message = (extra: Partial<ChatMessage> = {}): ChatMessage => ({
  id: MESSAGE_ID,
  courseId: COURSE_ID,
  senderId: USERS.student.id,
  body: 'Hello <script>alert(1)</script>',
  createdAt: '2026-05-10T10:00:00.000Z',
  deletedAt: null,
  sender: { id: USERS.student.id, fullName: USERS.student.fullName, role: 'student' },
  ...extra,
})

describe('GET /api/courses/:id/messages', () => {
  it('returns cursor-paginated history to members', async () => {
    vi.mocked(chatRepository.history).mockResolvedValue([message(), message({ id: 'm2', createdAt: '2026-05-10T09:00:00.000Z' })])
    const res = await request(app).get(`/api/courses/${COURSE_ID}/messages?limit=1`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data).toHaveLength(1)
    expect(res.body.meta).toMatchObject({ hasMore: true, nextBefore: '2026-05-10T10:00:00.000Z' })
  })

  it('hides the text of deleted messages', async () => {
    vi.mocked(chatRepository.history).mockResolvedValue([message({ deletedAt: '2026-05-10T10:01:00.000Z' })])
    const res = await request(app).get(`/api/courses/${COURSE_ID}/messages`).set(bearer('teacher'))
    expect(res.body.data[0].body).toBeNull()
  })

  it('forbids non-members (403)', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/messages`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('POST /api/courses/:id/messages', () => {
  it('sends a message as a member (body stored as plain text)', async () => {
    vi.mocked(chatRepository.insert).mockResolvedValue(message())
    const res = await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('student')).send({ body: 'Hello <script>alert(1)</script>' })
    expect(res.status).toBe(201)
    expect(chatRepository.insert).toHaveBeenCalledWith(expect.anything(), COURSE_ID, USERS.student.id, 'Hello <script>alert(1)</script>')
  })

  it('validates length 1-2000 (422)', async () => {
    expect((await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('student')).send({ body: '   ' })).status).toBe(422)
    expect((await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('student')).send({ body: 'x'.repeat(2001) })).status).toBe(422)
  })

  it('forbids non-members and admins from sending (403)', async () => {
    expect((await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('otherStudent')).send({ body: 'hi' })).status).toBe(403)
    expect((await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('admin')).send({ body: 'hi' })).status).toBe(403)
  })

  it('rate-limits to 20 messages per minute per user (429)', async () => {
    vi.mocked(chatRepository.insert).mockResolvedValue(message())
    for (let i = 0; i < 20; i += 1) {
      await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('teacher')).send({ body: `m${i}` })
    }
    expect((await request(app).post(`/api/courses/${COURSE_ID}/messages`).set(bearer('teacher')).send({ body: 'one more' })).status).toBe(429)
  })
})

describe('DELETE /api/messages/:id', () => {
  it('lets the sender delete within 5 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-10T10:04:00.000Z'))
    vi.mocked(chatRepository.findById).mockResolvedValue(message())
    expect((await request(app).delete(`/api/messages/${MESSAGE_ID}`).set(bearer('student'))).status).toBe(204)
    expect(chatRepository.softDelete).toHaveBeenCalled()
  })

  it('blocks the sender after 5 minutes but allows the course teacher', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-05-10T10:06:00.000Z'))
    vi.mocked(chatRepository.findById).mockResolvedValue(message())
    expect((await request(app).delete(`/api/messages/${MESSAGE_ID}`).set(bearer('student'))).status).toBe(403)
    expect((await request(app).delete(`/api/messages/${MESSAGE_ID}`).set(bearer('teacher'))).status).toBe(204)
  })

  it('forbids other students and teachers of other courses (403)', async () => {
    vi.mocked(chatRepository.findById).mockResolvedValue(message())
    expect((await request(app).delete(`/api/messages/${MESSAGE_ID}`).set(bearer('otherStudent'))).status).toBe(403)
    expect((await request(app).delete(`/api/messages/${MESSAGE_ID}`).set(bearer('otherTeacher'))).status).toBe(403)
  })
})
