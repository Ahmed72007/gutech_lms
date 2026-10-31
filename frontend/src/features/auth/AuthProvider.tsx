import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { apiSend, refreshSession, sessionStore } from '@/lib/api'
import { queryClient } from '@/lib/query-client'
import type { Profile, Session } from '@/lib/types'

type Status = 'loading' | 'authenticated' | 'anonymous'

interface AuthContextValue {
  status: Status
  user: Profile | null
  login: (email: string, password: string) => Promise<Profile>
  logout: () => Promise<void>
  updateUser: (profile: Profile) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<Profile | null>(null)

  useEffect(() => {
    const unsubscribe = sessionStore.subscribe((session) => {
      setUser(session?.profile ?? null)
      setStatus(session ? 'authenticated' : 'anonymous')
      if (!session) queryClient.clear()
    })
    const offEvent = sessionStore.onEvent((event) => {
      if (event.type === 'password-change-required') setUser((u) => (u ? { ...u, mustChangePassword: true } : u))
    })
    // Restore the session from the httpOnly refresh cookie on page load.
    void refreshSession()
    return () => {
      unsubscribe()
      offEvent()
    }
  }, [])

  // Refresh shortly before the access token expires so requests never stall.
  useEffect(() => {
    const session = sessionStore.get()
    if (status !== 'authenticated' || !session?.expiresAt) return
    const delay = Math.max(10_000, session.expiresAt * 1000 - Date.now() - 60_000)
    const id = setTimeout(() => void refreshSession(), delay)
    return () => clearTimeout(id)
  }, [status, user])

  const login = useCallback(async (email: string, password: string) => {
    const session = await apiSend<Session>('POST', '/auth/login', { email, password })
    sessionStore.set(session)
    return session.profile
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiSend('POST', '/auth/logout')
    } catch {
      /* the session is cleared locally regardless */
    }
    sessionStore.set(null)
  }, [])

  const updateUser = useCallback((profile: Profile) => {
    const session = sessionStore.get()
    if (session) sessionStore.set({ ...session, profile })
  }, [])

  const value = useMemo(() => ({ status, user, login, logout, updateUser }), [status, user, login, logout, updateUser])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/** For pages that only render once signed in. */
export function useUser(): Profile {
  const { user } = useAuth()
  if (!user) throw new Error('useUser called without a signed-in user')
  return user
}
