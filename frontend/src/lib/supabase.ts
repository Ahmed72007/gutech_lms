import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { sessionStore } from './api'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * The browser uses Supabase ONLY for Realtime subscriptions. Everything else goes
 * through the API. RLS decides which rows a subscriber receives, so Realtime must
 * authenticate with the signed-in user's JWT (not the publishable key).
 */
export const realtime: SupabaseClient | null =
  url && anonKey
    ? createClient(url, anonKey, {
        // Supplies the user's API-issued access token to Realtime on every join.
        accessToken: async () => sessionStore.token() ?? anonKey,
        realtime: { params: { eventsPerSecond: 10 } },
      })
    : null

export const realtimeEnabled = realtime !== null

// Push refreshed tokens to open channels so RLS keeps applying as the current user.
if (realtime) {
  sessionStore.subscribe(() => {
    void realtime.realtime.setAuth()
  })
}
