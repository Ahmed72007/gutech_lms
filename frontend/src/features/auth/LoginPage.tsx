import { zodResolver } from '@hookform/resolvers/zod'
import { AlertCircle, Eye, EyeOff, LogIn } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Field, fieldAria, Input } from '@/components/ui/input'
import { errorMessage } from '@/lib/api'
import { homePath } from '@/lib/utils'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

const schema = z.object({
  email: z.string().trim().min(1, 'Enter your email').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
})

type Values = z.infer<typeof schema>

export function LoginPage() {
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [showPassword, setShowPassword] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) })

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setServerError(null)
    try {
      const profile = await login(email, password)
      const from = (location.state as { from?: string } | null)?.from
      navigate(profile.mustChangePassword ? '/change-password' : (from ?? homePath(profile.role)), { replace: true })
    } catch (error) {
      setServerError(errorMessage(error))
    }
  })

  return (
    <AuthLayout title="Welcome back" subtitle="Sign in with your GUtech account to continue.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        {serverError && (
          <div role="alert" className="flex items-start gap-2.5 rounded-xl border border-danger/30 bg-danger-soft px-3.5 py-3 text-sm text-danger">
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{serverError}</span>
          </div>
        )}
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input type="email" autoComplete="username" placeholder="name@gutech.edu.om" {...fieldAria('email', errors.email?.message)} {...register('email')} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              className="pr-11"
              {...fieldAria('password', errors.password?.message)}
              {...register('password')}
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 grid w-11 place-items-center text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              aria-pressed={showPassword}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm font-medium text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          {!isSubmitting && <LogIn />} Sign in
        </Button>
        <p className="text-center text-xs text-muted-foreground">Need an account? Contact the GUtech admin team.</p>
      </form>
    </AuthLayout>
  )
}
