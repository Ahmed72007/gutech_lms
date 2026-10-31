import { Compass } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/features/auth/AuthProvider'
import { homePath } from '@/lib/utils'

export function NotFoundPage() {
  const { user } = useAuth()
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <div className="mx-auto mb-6 grid size-20 place-items-center rounded-3xl bg-primary-soft text-primary">
          <Compass className="size-9" />
        </div>
        <p className="font-display text-6xl font-bold text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold">This page doesn’t exist</h1>
        <p className="mt-2 text-muted-foreground">The link may be broken, or the page may have moved.</p>
        <Button asChild className="mt-6">
          <Link to={user ? homePath(user.role) : '/login'}>{user ? 'Back to dashboard' : 'Go to sign in'}</Link>
        </Button>
      </div>
    </div>
  )
}
