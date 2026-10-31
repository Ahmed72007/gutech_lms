import { logger } from '../config/logger.js'
import * as authRepository from '../repositories/auth.repository.js'
import * as profileRepository from '../repositories/profile.repository.js'
import type { Profile } from '../types/domain.js'
import { errors, HttpError } from '../utils/http.js'

export interface SessionResult {
  accessToken: string
  refreshToken: string
  expiresAt: number | null
  profile: Profile
}

/** Never reveal which part of the credentials was wrong. */
const invalidCredentials = () => new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password')

export async function login(email: string, password: string): Promise<SessionResult> {
  const session = await authRepository.signInWithPassword(email, password)
  if (!session) throw invalidCredentials()

  const profile = await profileRepository.findById(session.userId)
  if (!profile || !profile.isActive) {
    await authRepository.signOut(session.accessToken).catch(() => undefined)
    throw invalidCredentials()
  }
  return { ...session, profile }
}

export async function refresh(refreshToken: string): Promise<SessionResult> {
  const session = await authRepository.refreshSession(refreshToken)
  if (!session) throw errors.unauthorized('Your session has expired. Please sign in again.')

  const profile = await profileRepository.findById(session.userId)
  if (!profile || !profile.isActive) {
    await authRepository.revokeAllSessions(session.userId).catch(() => undefined)
    throw errors.unauthorized('Your session has expired. Please sign in again.')
  }
  return { ...session, profile }
}

export async function logout(accessToken: string): Promise<void> {
  await authRepository.signOut(accessToken).catch((err: unknown) => logger.warn({ err }, 'Sign-out failed'))
}

/**
 * Fire-and-forget so known and unknown emails get an identical response with
 * identical timing. The outcome is only logged.
 */
export function forgotPassword(email: string): void {
  authRepository.sendPasswordResetEmail(email).catch((err: unknown) => logger.warn({ err }, 'Password reset email failed'))
}

/** Authentication methods recorded in a Supabase JWT (`amr` claim). */
function authMethods(jwt: string): string[] {
  try {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1] ?? '', 'base64url').toString('utf8')) as {
      amr?: Array<{ method?: string }>
    }
    return (payload.amr ?? []).map((entry) => entry.method ?? '')
  } catch {
    return []
  }
}

/**
 * Completes a reset from the email link. Only a recovery session may do this,
 * and every session (including the recovery one) is revoked afterwards, so the
 * link is single-use and the old password stops working immediately.
 */
export async function resetPassword(recoveryToken: string, newPassword: string): Promise<void> {
  const invalidLink = () =>
    new HttpError(401, 'INVALID_RECOVERY_TOKEN', 'This reset link has expired or has already been used. Request a new one.')

  const userId = await authRepository.verifyAccessToken(recoveryToken)
  if (!userId) throw invalidLink()
  const methods = authMethods(recoveryToken)
  if (!methods.includes('recovery') && !methods.includes('otp')) throw invalidLink()

  await authRepository.updatePassword(userId, newPassword)
  await profileRepository.update(userId, { mustChangePassword: false })
  await authRepository.revokeAllSessions(userId)
}

/**
 * Changing the password revokes the user's existing sessions in Supabase, so the
 * caller gets a fresh session signed in with the new password.
 */
export async function changePassword(user: Profile, currentPassword: string, newPassword: string): Promise<SessionResult> {
  const check = await authRepository.signInWithPassword(user.email, currentPassword)
  if (!check) {
    throw errors.unprocessable('Current password is incorrect.', [{ path: 'currentPassword', message: 'Current password is incorrect' }])
  }
  // The verification created a throwaway session; close it.
  await authRepository.signOut(check.accessToken).catch(() => undefined)

  await authRepository.updatePassword(user.id, newPassword)
  const updated = (await profileRepository.update(user.id, { mustChangePassword: false })) ?? { ...user, mustChangePassword: false }

  const session = await authRepository.signInWithPassword(user.email, newPassword)
  if (!session) throw errors.unauthorized('Password changed. Please sign in again.')
  return { ...session, profile: updated }
}
