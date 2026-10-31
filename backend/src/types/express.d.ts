import type { SupabaseClient } from '@supabase/supabase-js'
import type { Profile } from './domain.js'

declare global {
  namespace Express {
    interface Request {
      user?: Profile
      db?: SupabaseClient
      accessToken?: string
    }
  }
}

export {}
