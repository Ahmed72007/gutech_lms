import { Navigate, Outlet, useLocation } from 'react-router-dom'
import type { Role } from '@/lib/types'
import { homePath } from '@/lib/utils'
import { BrandMark } from '@/components/shared'
import { useAuth } from './AuthProvider'

export function FullScreenLoader() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background" aria-busy="true" aria-label="Loading">
      <div className="flex flex-col items-center gap-5">
        <BrandMark />
        <div className="h-1 w-40 overflow-hidden rounded-full bg-muted">
          <div className="h-full w-1/3 animate-[shimmer_1.2s_infinite] rounded-full bg-primary" style={{ transform: 'translateX(-100%)' }} />
        </div>
      </div>
    </div>
  )
}

/**
 * UX only: the API enforces every permission. Logged-out visitors go to /login,
 * and users with a temporary password must change it first.
 */
export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()
  if (status === 'loading') return <FullScreenLoader />
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  if (user.mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />
  return <Outlet />
}

export function RequireRole({ roles }: { roles: Role[] }) {
  const { user } = useAuth()
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to={homePath(user.role)} replace />
  return <Outlet />
}

/** Auth pages bounce signed-in users to their dashboard. */
export function GuestOnly() {
  const { status, user } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (user) return <Navigate to={user.mustChangePassword ? '/change-password' : homePath(user.role)} replace />
  return <Outlet />
}

export function HomeRedirect() {
  const { user } = useAuth()
  return <Navigate to={user ? homePath(user.role) : '/login'} replace />
}
