import request from 'supertest'
import { describe, expect, it, vi } from 'vitest'
import * as authRepository from '../src/repositories/auth.repository.js'
import * as profileRepository from '../src/repositories/profile.repository.js'
import { app, bearer, USERS } from './helpers.js'

const session = (userId: string) => ({ userId, accessToken: 'student-token', refreshToken: 'refresh-1', expiresAt: 123 })

/** A JWT-shaped string whose payload carries the given auth methods. */
function jwtWithMethods(...methods: string[]) {
  const payload = Buffer.from(JSON.stringify({ amr: methods.map((method) => ({ method })) })).toString('base64url')
  return `header.${payload}.sig`
}

describe('POST /api/auth/login', () => {
  it('returns an access token, profile with role, and sets an httpOnly refresh cookie', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(session(USERS.student.id))
    const res = await request(app).post('/api/auth/login').send({ email: 'Sara.Student@gutech.example', password: 'whatever123' })
    expect(res.status).toBe(200)
    expect(res.body.data.accessToken).toBe('student-token')
    expect(res.body.data.profile.role).toBe('student')
    expect(res.headers['set-cookie']?.[0]).toMatch(/lms_refresh=refresh-1;.*HttpOnly/)
    expect(authRepository.signInWithPassword).toHaveBeenCalledWith('sara.student@gutech.example', 'whatever123')
  })

  it('uses one generic error for wrong credentials', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(null)
    const res = await request(app).post('/api/auth/login').send({ email: 'nobody@gutech.example', password: 'bad' })
    expect(res.status).toBe(401)
    expect(res.body.error).toEqual({ code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' })
  })

  it('blocks deactivated users with the same generic error', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(session(USERS.inactive.id))
    vi.mocked(authRepository.signOut).mockResolvedValue()
    const res = await request(app).post('/api/auth/login').send({ email: 'inactive@gutech.example', password: 'Password123' })
    expect(res.status).toBe(401)
    expect(res.body.error.message).toBe('Invalid email or password')
  })

  it('validates the request body (422)', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: 'not-an-email' })
    expect(res.status).toBe(422)
    expect(res.body.error.code).toBe('VALIDATION_ERROR')
  })

  it('rate-limits to 5 attempts per 15 minutes per IP + email (429)', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(null)
    const body = { email: 'ratelimit@gutech.example', password: 'nope' }
    for (let i = 0; i < 5; i += 1) await request(app).post('/api/auth/login').send(body)
    const res = await request(app).post('/api/auth/login').send(body)
    expect(res.status).toBe(429)
  })
})

describe('no public sign-up', () => {
  it.each(['/api/auth/signup', '/api/auth/register'])('POST %s returns 404', async (path) => {
    const res = await request(app).post(path).send({ email: 'x@y.z', password: 'Password123' })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/auth/refresh', () => {
  it('exchanges the refresh cookie for a new access token', async () => {
    vi.mocked(authRepository.refreshSession).mockResolvedValue(session(USERS.teacher.id))
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'lms_refresh=refresh-1')
    expect(res.status).toBe(200)
    expect(res.body.data.profile.role).toBe('teacher')
  })

  it('rejects a missing cookie (401)', async () => {
    const res = await request(app).post('/api/auth/refresh')
    expect(res.status).toBe(401)
  })

  it('rejects a refresh for a deactivated user (401)', async () => {
    vi.mocked(authRepository.refreshSession).mockResolvedValue(session(USERS.inactive.id))
    vi.mocked(authRepository.revokeAllSessions).mockResolvedValue()
    const res = await request(app).post('/api/auth/refresh').set('Cookie', 'lms_refresh=refresh-1')
    expect(res.status).toBe(401)
  })
})

describe('GET /api/auth/me and requireAuth', () => {
  it('returns the current profile', async () => {
    const res = await request(app).get('/api/auth/me').set(bearer('teacher'))
    expect(res.status).toBe(200)
    expect(res.body.data).toMatchObject({ id: USERS.teacher.id, role: 'teacher' })
  })

  it('rejects requests without a token (401)', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401)
  })

  it('rejects a deactivated user even with a valid token (401)', async () => {
    expect((await request(app).get('/api/auth/me').set(bearer('inactive'))).status).toBe(401)
  })

  it('forces a password change before other routes (403 PASSWORD_CHANGE_REQUIRED)', async () => {
    const me = await request(app).get('/api/auth/me').set(bearer('newUser'))
    expect(me.status).toBe(200)
    const other = await request(app).get('/api/me/dashboard').set(bearer('newUser'))
    expect(other.status).toBe(403)
    expect(other.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED')
  })
})

describe('POST /api/auth/logout', () => {
  it('signs out and clears the cookie', async () => {
    vi.mocked(authRepository.signOut).mockResolvedValue()
    const res = await request(app).post('/api/auth/logout').set(bearer('student'))
    expect(res.status).toBe(200)
    expect(authRepository.signOut).toHaveBeenCalledWith('student-token')
    expect(res.headers['set-cookie']?.[0]).toMatch(/lms_refresh=;/)
  })

  it('requires authentication (401)', async () => {
    expect((await request(app).post('/api/auth/logout')).status).toBe(401)
  })
})

describe('POST /api/auth/forgot-password', () => {
  it('returns the same 200 response for known and unknown emails', async () => {
    vi.mocked(authRepository.sendPasswordResetEmail).mockResolvedValue()
    const known = await request(app).post('/api/auth/forgot-password').send({ email: 'sara.student@gutech.example' })
    const unknown = await request(app).post('/api/auth/forgot-password').send({ email: 'ghost@gutech.example' })
    expect(known.status).toBe(200)
    expect(unknown.status).toBe(200)
    expect(known.body).toEqual(unknown.body)
  })

  it('rate-limits to 3 per hour per email (429)', async () => {
    vi.mocked(authRepository.sendPasswordResetEmail).mockResolvedValue()
    const body = { email: 'limited@gutech.example' }
    for (let i = 0; i < 3; i += 1) await request(app).post('/api/auth/forgot-password').send(body)
    expect((await request(app).post('/api/auth/forgot-password').send(body)).status).toBe(429)
  })
})

describe('POST /api/auth/reset-password', () => {
  it('sets the new password with a recovery token and revokes every session', async () => {
    const token = jwtWithMethods('recovery')
    vi.mocked(authRepository.verifyAccessToken).mockResolvedValue(USERS.student.id)
    const res = await request(app).post('/api/auth/reset-password').set('Authorization', `Bearer ${token}`).send({ newPassword: 'BrandNew2026' })
    expect(res.status).toBe(200)
    expect(authRepository.updatePassword).toHaveBeenCalledWith(USERS.student.id, 'BrandNew2026')
    expect(authRepository.revokeAllSessions).toHaveBeenCalledWith(USERS.student.id)
  })

  it('rejects an ordinary (non-recovery) session token', async () => {
    vi.mocked(authRepository.verifyAccessToken).mockResolvedValue(USERS.student.id)
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', `Bearer ${jwtWithMethods('password')}`)
      .send({ newPassword: 'BrandNew2026' })
    expect(res.status).toBe(401)
    expect(res.body.error.code).toBe('INVALID_RECOVERY_TOKEN')
  })

  it('rejects an expired or reused link', async () => {
    vi.mocked(authRepository.verifyAccessToken).mockResolvedValue(null)
    const res = await request(app)
      .post('/api/auth/reset-password')
      .set('Authorization', `Bearer ${jwtWithMethods('recovery')}`)
      .send({ newPassword: 'BrandNew2026' })
    expect(res.status).toBe(401)
  })

  it('enforces the password policy (422)', async () => {
    const res = await request(app).post('/api/auth/reset-password').set('Authorization', `Bearer ${jwtWithMethods('recovery')}`).send({ newPassword: 'short' })
    expect(res.status).toBe(422)
  })
})

describe('POST /api/auth/change-password', () => {
  it('changes the password after verifying the current one', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(session(USERS.newUser.id))
    vi.mocked(authRepository.signOut).mockResolvedValue()
    vi.mocked(profileRepository.update).mockResolvedValue({ ...USERS.newUser, mustChangePassword: false })
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer('newUser'))
      .send({ currentPassword: 'ChangeMe123!', newPassword: 'MyNewPass2026' })
    expect(res.status).toBe(200)
    expect(res.body.data.profile.mustChangePassword).toBe(false)
    expect(res.body.data.accessToken).toBe('student-token')
    expect(res.headers['set-cookie']?.[0]).toMatch(/lms_refresh=refresh-1/)
    expect(authRepository.updatePassword).toHaveBeenCalledWith(USERS.newUser.id, 'MyNewPass2026')
  })

  it('rejects a wrong current password (422)', async () => {
    vi.mocked(authRepository.signInWithPassword).mockResolvedValue(null)
    const res = await request(app)
      .post('/api/auth/change-password')
      .set(bearer('student'))
      .send({ currentPassword: 'wrong', newPassword: 'MyNewPass2026' })
    expect(res.status).toBe(422)
    expect(authRepository.updatePassword).not.toHaveBeenCalled()
  })

  it('requires authentication (401)', async () => {
    expect((await request(app).post('/api/auth/change-password').send({})).status).toBe(401)
  })
})
