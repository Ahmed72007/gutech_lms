import type { CookieOptions, Request, Response } from 'express'
import { isProduction } from '../config/env.js'
import { bearerToken } from '../middleware/auth.js'
import { changePasswordSchema, forgotPasswordSchema, loginSchema, resetPasswordSchema } from '../schemas/auth.schema.js'
import * as authService from '../services/auth.service.js'
import { toPublicProfile } from '../services/profile.service.js'
import { ctx, errors, HttpError, sendData } from '../utils/http.js'

const REFRESH_COOKIE = 'lms_refresh'

// Production runs web and API on different sites, which requires SameSite=None + Secure.
const refreshCookie: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'lax',
  path: '/api/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
}

async function sendSession(res: Response, session: authService.SessionResult) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookie)
  sendData(res, {
    accessToken: session.accessToken,
    expiresAt: session.expiresAt,
    profile: await toPublicProfile(session.profile),
  })
}

export async function login(req: Request, res: Response) {
  const { email, password } = loginSchema.parse(req.body)
  await sendSession(res, await authService.login(email, password))
}

export async function refresh(req: Request, res: Response) {
  const token = (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE]
  if (!token) throw errors.unauthorized('Your session has expired. Please sign in again.')
  try {
    await sendSession(res, await authService.refresh(token))
  } catch (error) {
    res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined })
    throw error
  }
}

export async function logout(req: Request, res: Response) {
  await authService.logout(ctx(req).accessToken)
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined })
  sendData(res, { success: true })
}

export async function me(req: Request, res: Response) {
  sendData(res, await toPublicProfile(ctx(req).user))
}

export async function forgotPassword(req: Request, res: Response) {
  const { email } = forgotPasswordSchema.parse(req.body)
  authService.forgotPassword(email)
  sendData(res, { message: 'If an account exists for that email, we have sent a password reset link.' })
}

export async function resetPassword(req: Request, res: Response) {
  const token = bearerToken(req)
  if (!token) throw new HttpError(401, 'INVALID_RECOVERY_TOKEN', 'This reset link has expired or has already been used. Request a new one.')
  const { newPassword } = resetPasswordSchema.parse(req.body)
  await authService.resetPassword(token, newPassword)
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookie, maxAge: undefined })
  sendData(res, { success: true })
}

export async function changePassword(req: Request, res: Response) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
  await sendSession(res, await authService.changePassword(ctx(req).user, currentPassword, newPassword))
}
