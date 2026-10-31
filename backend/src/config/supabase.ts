import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { env } from './env.js'

const serverAuthOptions = {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
} as const

/**
 * Service-role client. Bypasses RLS, so it is only used after the service layer
 * has authorized the caller, and never from a route a non-admin can shape freely.
 */
export const adminDb: SupabaseClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, serverAuthOptions)

/** Fresh anon client for auth calls that mutate client state (sign-in, refresh). */
export function anonClient(): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, serverAuthOptions)
}

/** Client acting as the signed-in user, so RLS applies as a second line of defense. */
export function userClient(accessToken: string): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    ...serverAuthOptions,
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}
