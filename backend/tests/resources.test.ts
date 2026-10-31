import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as resourceRepository from '../src/repositories/resource.repository.js'
import * as storage from '../src/repositories/storage.repository.js'
import { app, bearer, COURSE_ID, FILES, USERS } from './helpers.js'

const RESOURCE_ID = '60000000-0000-4000-8000-000000000001'
const resource = {
  id: RESOURCE_ID,
  courseId: COURSE_ID,
  title: 'Week 1 slides',
  description: null,
  fileName: 'week1.pdf',
  filePath: `${COURSE_ID}/uuid-week1.pdf`,
  mimeType: 'application/pdf',
  sizeBytes: 1000,
  createdAt: '2026-01-01T00:00:00.000Z',
  uploadedBy: { id: USERS.teacher.id, fullName: USERS.teacher.fullName },
}

describe('POST /api/courses/:id/resources', () => {
  it('uploads to resources/{course_id}/{uuid}-{filename} for a course teacher', async () => {
    vi.mocked(resourceRepository.insert).mockResolvedValue(resource)
    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/resources`)
      .set(bearer('teacher'))
      .field('title', 'Week 1 slides')
      .attach('file', FILES.pdf, { filename: 'week1.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(201)
    expect(res.body.data.filePath).toBeUndefined()
    const [bucket, path, , mime] = vi.mocked(storage.upload).mock.calls[0] ?? []
    expect(bucket).toBe('resources')
    expect(path).toMatch(new RegExp(`^${COURSE_ID}/[0-9a-f-]{36}-week1\\.pdf$`))
    expect(mime).toBe('application/pdf')
  })

  it('rejects a teacher who does not teach the course (403)', async () => {
    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/resources`)
      .set(bearer('otherTeacher'))
      .field('title', 'Nope')
      .attach('file', FILES.pdf, { filename: 'x.pdf' })
    expect(res.status).toBe(403)
    expect(storage.upload).not.toHaveBeenCalled()
  })

  it('rejects students (403)', async () => {
    const res = await request(app).post(`/api/courses/${COURSE_ID}/resources`).set(bearer('student')).field('title', 'x').attach('file', FILES.pdf, 'x.pdf')
    expect(res.status).toBe(403)
  })

  it('rejects an .exe by magic bytes even when renamed, with a clear message', async () => {
    const res = await request(app)
      .post(`/api/courses/${COURSE_ID}/resources`)
      .set(bearer('teacher'))
      .field('title', 'Sneaky')
      .attach('file', FILES.exe, { filename: 'notes.pdf', contentType: 'application/pdf' })
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/file type is not allowed/i)
  })

  it('rejects files over 25 MB', async () => {
    const big = Buffer.concat([FILES.pdf, Buffer.alloc(26 * 1024 * 1024)])
    const res = await request(app).post(`/api/courses/${COURSE_ID}/resources`).set(bearer('teacher')).field('title', 'Huge').attach('file', big, 'huge.pdf')
    expect(res.status).toBe(422)
    expect(res.body.error.message).toMatch(/too large/i)
  })
})

describe('GET /api/courses/:id/resources', () => {
  it('lists for enrolled students with pagination', async () => {
    vi.mocked(resourceRepository.listForCourse).mockResolvedValue({ rows: [resource], total: 1 })
    const res = await request(app).get(`/api/courses/${COURSE_ID}/resources?search=week`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.meta).toEqual({ page: 1, pageSize: 20, total: 1 })
  })

  it('returns 403 for a student who is not enrolled', async () => {
    expect((await request(app).get(`/api/courses/${COURSE_ID}/resources`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('GET /api/resources/:id/download', () => {
  it('returns a 60 s signed URL to members', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(resource)
    const res = await request(app).get(`/api/resources/${RESOURCE_ID}/download`).set(bearer('student'))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ fileName: 'week1.pdf', expiresIn: 60 })
  })

  it('returns 403 for a student who is not enrolled', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(resource)
    expect((await request(app).get(`/api/resources/${RESOURCE_ID}/download`).set(bearer('otherStudent'))).status).toBe(403)
  })
})

describe('DELETE /api/resources/:id', () => {
  it('deletes the row and the storage object for the uploader', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(resource)
    const res = await request(app).delete(`/api/resources/${RESOURCE_ID}`).set(bearer('teacher'))
    expect(res.status).toBe(204)
    expect(resourceRepository.remove).toHaveBeenCalledWith(RESOURCE_ID)
    expect(storage.remove).toHaveBeenCalledWith('resources', [resource.filePath])
  })

  it('lets admins delete too', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(resource)
    expect((await request(app).delete(`/api/resources/${RESOURCE_ID}`).set(bearer('admin'))).status).toBe(204)
  })

  it('forbids other teachers (403)', async () => {
    vi.mocked(resourceRepository.findById).mockResolvedValue(resource)
    expect((await request(app).delete(`/api/resources/${RESOURCE_ID}`).set(bearer('otherTeacher'))).status).toBe(403)
    expect(storage.remove).not.toHaveBeenCalled()
  })
})
