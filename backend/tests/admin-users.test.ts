import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as auditRepository from '../src/repositories/audit.repository.js'
import * as authRepository from '../src/repositories/auth.repository.js'
import * as profileRepository from '../src/repositories/profile.repository.js'
import { app, bearer, USERS } from './helpers.js'

const newUser = { fullName: 'Hana Haddad', email: 'hana@gutech.example', role: 'student', tempPassword: 'TempPass2026', rollNo: 'S2026999' }

describe('POST /api/admin/users', () => {
  it('creates an auth user and profile flagged to change password', async () => {
    vi.mocked(profileRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.createAuthUser).mockResolvedValue('new-id')
    vi.mocked(profileRepository.insert).mockResolvedValue({ ...USERS.newUser, id: 'new-id', email: newUser.email })
    const res = await request(app).post('/api/admin/users').set(bearer('admin')).send(newUser)
    expect(res.status).toBe(201)
    expect(res.body.data.mustChangePassword).toBe(true)
    expect(auditRepository.record).toHaveBeenCalledWith(USERS.admin.id, 'user.create', 'profile', 'new-id')
  })

  it('rolls back the auth user when the profile insert fails', async () => {
    vi.mocked(profileRepository.findByEmail).mockResolvedValue(null)
    vi.mocked(authRepository.createAuthUser).mockResolvedValue('new-id')
    vi.mocked(profileRepository.insert).mockRejectedValue(new Error('boom'))
    vi.mocked(authRepository.deleteAuthUser).mockResolvedValue()
    const res = await request(app).post('/api/admin/users').set(bearer('admin')).send(newUser)
    expect(res.status).toBe(500)
    expect(authRepository.deleteAuthUser).toHaveBeenCalledWith('new-id')
  })

  it('rejects duplicates (409) and weak passwords (422)', async () => {
    vi.mocked(profileRepository.findByEmail).mockResolvedValue(USERS.student)
    expect((await request(app).post('/api/admin/users').set(bearer('admin')).send(newUser)).status).toBe(409)
    expect((await request(app).post('/api/admin/users').set(bearer('admin')).send({ ...newUser, tempPassword: 'abc' })).status).toBe(422)
  })

  it.each(['teacher', 'student'] as const)('is forbidden for a %s (403)', async (who) => {
    expect((await request(app).post('/api/admin/users').set(bearer(who)).send(newUser)).status).toBe(403)
  })
})

describe('GET /api/admin/users', () => {
  it('lists with pagination meta, search and role filter', async () => {
    vi.mocked(profileRepository.list).mockResolvedValue({ rows: [USERS.teacher], total: 1 })
    const res = await request(app).get('/api/admin/users?role=teacher&search=tar&page=1&pageSize=10').set(bearer('admin'))
    expect(res.status).toBe(200)
    expect(res.body.meta).toEqual({ page: 1, pageSize: 10, total: 1 })
    expect(profileRepository.list).toHaveBeenCalledWith({ search: 'tar', role: 'teacher', status: undefined }, { page: 1, pageSize: 10, search: 'tar', role: 'teacher' })
  })

  it('caps pageSize at 100 (422)', async () => {
    expect((await request(app).get('/api/admin/users?pageSize=500').set(bearer('admin'))).status).toBe(422)
  })

  it('is forbidden for students (403) and anonymous users (401)', async () => {
    expect((await request(app).get('/api/admin/users').set(bearer('student'))).status).toBe(403)
    expect((await request(app).get('/api/admin/users')).status).toBe(401)
  })
})

describe('PATCH /api/admin/users/:id', () => {
  it('deactivates a user, revokes their sessions and audits it', async () => {
    vi.mocked(profileRepository.update).mockResolvedValue({ ...USERS.student, isActive: false })
    const res = await request(app).patch(`/api/admin/users/${USERS.student.id}`).set(bearer('admin')).send({ isActive: false })
    expect(res.status).toBe(200)
    expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(USERS.student.id)
    expect(auditRepository.record).toHaveBeenCalledWith(USERS.admin.id, 'user.deactivate', 'profile', USERS.student.id)
  })

  it('prevents admins from deactivating themselves (422)', async () => {
    const res = await request(app).patch(`/api/admin/users/${USERS.admin.id}`).set(bearer('admin')).send({ isActive: false })
    expect(res.status).toBe(422)
  })

  it('is forbidden for teachers (403)', async () => {
    expect((await request(app).patch(`/api/admin/users/${USERS.student.id}`).set(bearer('teacher')).send({ isActive: false })).status).toBe(403)
  })
})

describe('POST /api/admin/users/:id/reset-password', () => {
  it('sends a reset email by default', async () => {
    const res = await request(app).post(`/api/admin/users/${USERS.student.id}/reset-password`).set(bearer('admin')).send({})
    expect(res.status).toBe(200)
    expect(authRepository.sendPasswordResetEmail).toHaveBeenCalledWith(USERS.student.email)
  })

  it('can set a temporary password, forcing a change and revoking sessions', async () => {
    const res = await request(app)
      .post(`/api/admin/users/${USERS.student.id}/reset-password`)
      .set(bearer('admin'))
      .send({ mode: 'temp', tempPassword: 'Temporary2026' })
    expect(res.status).toBe(200)
    expect(profileRepository.update).toHaveBeenCalledWith(USERS.student.id, { mustChangePassword: true })
    expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(USERS.student.id)
  })

  it('is forbidden for students (403)', async () => {
    expect((await request(app).post(`/api/admin/users/${USERS.teacher.id}/reset-password`).set(bearer('student')).send({})).status).toBe(403)
  })
})
