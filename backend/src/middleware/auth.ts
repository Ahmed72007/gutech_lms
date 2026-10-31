import type { NextFunction, Request, Response } from 'express'
import { userClient } from '../config/supabase.js'
import * as authRepository from '../repositories/auth.repository.js'
import * as profileRepository from '../repositories/profile.repository.js'
import type { Role } from '../types/domain.js'
import { asyncHandler, errors, HttpError } from '../utils/http.js'

/** Routes a user with a temporary password may still reach. */
const PASSWORD_CHANGE_ALLOWED = new Set(['/api/auth/me', '/api/auth/change-password', '/api/auth/logout'])

export function bearerToken(req: Request): string | null {
  const header = req.header('authorization')
  const match = header?.match(/^Bearer\s+(\S+)$/i)
  return match?.[1] ?? null
}

/**
 * Verifies the Supabase JWT with the auth server (so revoked sessions fail),
 * loads the profile and rejects deactivated users even with a valid token.
 */
export const requireAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const token = bearerToken(req)
  if (!token) throw errors.unauthorized()

  const userId = await authRepository.verifyAccessToken(token)
  if (!userId) throw errors.unauthorized()

  const profile = await profileRepository.findById(userId)
  if (!profile || !profile.isActive) throw errors.unauthorized()

  req.user = profile
  req.accessToken = token
  req.db = userClient(token)

  if (profile.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(`${req.baseUrl}${req.path}`)) {
    throw new HttpError(403, 'PASSWORD_CHANGE_REQUIRED', 'Change your temporary password before continuing.')
  }
  next()
})

export function requireRole(...roles: Role[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(errors.unauthorized())
    if (!roles.includes(req.user.role)) return next(errors.forbidden())
    return next()
  }
}
