import { adminDb, anonClient } from '../config/supabase.js'
import { env } from '../config/env.js'
import { unwrap } from '../utils/db.js'

export interface AuthSession {
  userId: string
  accessToken: string
  refreshToken: string
  expiresAt: number | null
}

export async function signInWithPassword(email: string, password: string): Promise<AuthSession | null> {
  const { data, error } = await anonClient().auth.signInWithPassword({ email, password })
  if (error || !data.session || !data.user) return null
  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
  }
}

export async function refreshSession(refreshToken: string): Promise<AuthSession | null> {
  const { data, error } = await anonClient().auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session || !data.user) return null
  return {
    userId: data.user.id,
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at ?? null,
  }
}

/** Asks the auth server, so expired or revoked sessions are rejected. */
export async function verifyAccessToken(accessToken: string): Promise<string | null> {
  const { data, error } = await adminDb.auth.getUser(accessToken)
  if (error || !data.user) return null
  return data.user.id
}

export async function signOut(accessToken: string): Promise<void> {
  await adminDb.auth.admin.signOut(accessToken, 'local')
}

export async function revokeAllSessions(userId: string): Promise<void> {
  unwrap(await adminDb.rpc('revoke_user_sessions', { p_user_id: userId }))
}

export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await anonClient().auth.resetPasswordForEmail(email, { redirectTo: env.PASSWORD_RESET_REDIRECT })
  if (error) throw error
}

export async function updatePassword(userId: string, password: string): Promise<void> {
  const { error } = await adminDb.auth.admin.updateUserById(userId, { password })
  if (error) throw error
}

export async function createAuthUser(email: string, password: string, fullName: string): Promise<string> {
  const { data, error } = await adminDb.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (error || !data.user) throw error ?? new Error('User creation failed')
  return data.user.id
}

export async function deleteAuthUser(userId: string): Promise<void> {
  await adminDb.auth.admin.deleteUser(userId)
}
