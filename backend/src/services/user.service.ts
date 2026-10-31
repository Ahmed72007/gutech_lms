import type { z } from 'zod'
import { logger } from '../config/logger.js'
import * as auditRepository from '../repositories/audit.repository.js'
import * as authRepository from '../repositories/auth.repository.js'
import * as profileRepository from '../repositories/profile.repository.js'
import type { adminResetPasswordSchema, createUserSchema, listUsersQuery, updateUserSchema } from '../schemas/user.schema.js'
import type { Paged, Profile } from '../types/domain.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'

/** Admin-facing view of a user; internal storage paths stay private. */
export function publicUser(p: Profile) {
  return {
    id: p.id,
    fullName: p.fullName,
    email: p.email,
    role: p.role,
    rollNo: p.rollNo,
    isActive: p.isActive,
    mustChangePassword: p.mustChangePassword,
    createdAt: p.createdAt,
  }
}

export type PublicUser = ReturnType<typeof publicUser>

export async function createUser(actor: Profile, input: z.infer<typeof createUserSchema>): Promise<PublicUser> {
  if (await profileRepository.findByEmail(input.email)) {
    throw errors.conflict('A user with this email already exists.', 'EMAIL_TAKEN')
  }

  const userId = await authRepository.createAuthUser(input.email, input.tempPassword, input.fullName)
  try {
    const profile = await profileRepository.insert({
      id: userId,
      fullName: input.fullName,
      email: input.email,
      role: input.role,
      rollNo: input.role === 'student' ? (input.rollNo ?? null) : null,
    })
    await auditRepository.record(actor.id, 'user.create', 'profile', userId)
    return publicUser(profile)
  } catch (error) {
    // Keep auth.users and profiles consistent.
    await authRepository.deleteAuthUser(userId).catch((err: unknown) => logger.error({ err }, 'Rollback of auth user failed'))
    throw error
  }
}

export async function listUsers(query: z.infer<typeof listUsersQuery>): Promise<Paged<PublicUser>> {
  const { rows, total } = await profileRepository.list({ search: query.search, role: query.role, status: query.status }, query)
  return { data: rows.map(publicUser), meta: pageMeta(query, total) }
}

export async function updateUser(actor: Profile, userId: string, input: z.infer<typeof updateUserSchema>): Promise<PublicUser> {
  if (userId === actor.id && (input.isActive === false || (input.role && input.role !== 'admin'))) {
    throw errors.unprocessable('You cannot deactivate your own account or remove your own admin role.')
  }
  const existing = await profileRepository.findById(userId)
  if (!existing) throw errors.notFound('User not found.')

  // Roll numbers belong to students only; clear it when someone stops being a student.
  const nextRole = input.role ?? existing.role
  const rollNo = nextRole === 'student' ? input.rollNo : existing.rollNo !== null ? null : undefined

  const updated = await profileRepository.update(userId, {
    fullName: input.fullName,
    role: input.role,
    isActive: input.isActive,
    rollNo,
  })
  if (!updated) throw errors.notFound('User not found.')

  if (input.isActive === false && existing.isActive) {
    // Deactivated users must not keep using an old token or refresh token.
    await authRepository.revokeAllSessions(userId)
    await auditRepository.record(actor.id, 'user.deactivate', 'profile', userId)
  } else if (input.isActive === true && !existing.isActive) {
    await auditRepository.record(actor.id, 'user.activate', 'profile', userId)
  }
  if (input.role && input.role !== existing.role) await auditRepository.record(actor.id, 'user.role_change', 'profile', userId)
  if (input.fullName || input.rollNo !== undefined) await auditRepository.record(actor.id, 'user.update', 'profile', userId)

  return publicUser(updated)
}

export async function resetUserPassword(actor: Profile, userId: string, input: z.infer<typeof adminResetPasswordSchema>) {
  const user = await profileRepository.findById(userId)
  if (!user) throw errors.notFound('User not found.')

  if (input.mode === 'temp' && input.tempPassword) {
    await authRepository.updatePassword(userId, input.tempPassword)
    await profileRepository.update(userId, { mustChangePassword: true })
    await authRepository.revokeAllSessions(userId)
    await auditRepository.record(actor.id, 'user.temp_password', 'profile', userId)
    return { mode: 'temp' as const, message: 'Temporary password set. The user must change it at next sign-in.' }
  }

  await authRepository.sendPasswordResetEmail(user.email)
  await auditRepository.record(actor.id, 'user.reset_email', 'profile', userId)
  return { mode: 'email' as const, message: `A reset link was sent to ${user.email}.` }
}
