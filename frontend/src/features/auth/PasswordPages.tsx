import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, CheckCircle2, KeyRound, LinkIcon, MailCheck } from 'lucide-react'
import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { PasswordMeter } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Field, fieldAria, Input } from '@/components/ui/input'
import { ApiError, apiSend, buildUrl, errorMessage, request, sessionStore } from '@/lib/api'
import type { Profile, Session } from '@/lib/types'
import { homePath } from '@/lib/utils'
import { AuthLayout } from './AuthLayout'
import { useAuth } from './AuthProvider'

export const passwordPolicy = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number')

const newPasswordSchema = z
  .object({ newPassword: passwordPolicy, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })

// Forgot password ---------------------------------------------------------------
export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<{ email: string }>({ resolver: zodResolver(z.object({ email: z.string().trim().email('Enter a valid email address') })) })

  const onSubmit = handleSubmit(async ({ email }) => {
    try {
      await apiSend('POST', '/auth/forgot-password', { email })
      setSent(true)
    } catch (error) {
      // Rate limiting is the only failure worth surfacing; never reveal whether an email exists.
      if (error instanceof ApiError && error.status === 429) toast.error(error.message)
      else setSent(true)
    }
  })

  if (sent) {
    return (
      <AuthLayout title="Check your inbox">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary-soft text-primary">
            <MailCheck className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">
            If an account exists for that email, we have sent a password reset link. It expires in one hour.
          </p>
        </div>
        <Button asChild variant="ghost" className="mt-6 w-full">
          <Link to="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Reset your password" subtitle="Enter your account email and we will send you a reset link.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input type="email" autoComplete="email" {...fieldAria('email', errors.email?.message)} {...register('email')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Send reset link
        </Button>
        <Button asChild variant="ghost" className="w-full">
          <Link to="/login">
            <ArrowLeft /> Back to sign in
          </Link>
        </Button>
      </form>
    </AuthLayout>
  )
}

// Reset password (from email link) ----------------------------------------------
function readRecoveryHash(): { token: string | null; error: string | null } {
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const query = new URLSearchParams(window.location.search)
  const error = params.get('error_description') ?? query.get('error_description')
  if (error) return { token: null, error }
  return { token: params.get('access_token'), error: null }
}

export function ResetPasswordPage() {
  const navigate = useNavigate()
  const recovery = useMemo(readRecoveryHash, [])
  const [linkError, setLinkError] = useState<string | null>(recovery.token ? null : (recovery.error ?? 'This reset link is invalid.'))
  const [done, setDone] = useState(false)
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) })

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    try {
      // The recovery token from the email link authorizes this single request.
      const res = await fetch(buildUrl('/auth/reset-password'), {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${recovery.token}` },
        body: JSON.stringify({ newPassword }),
      })
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
        if (res.status === 401) setLinkError(body.error?.message ?? 'This reset link has expired or has already been used.')
        else toast.error(body.error?.message ?? 'Could not reset the password.')
        return
      }
      window.history.replaceState(null, '', '/reset-password')
      setDone(true)
    } catch (error) {
      toast.error(errorMessage(error))
    }
  })

  if (linkError) {
    return (
      <AuthLayout title="Link expired">
        <div className="rounded-2xl border border-danger/30 bg-danger-soft/60 p-6 text-center">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-danger-soft text-danger">
            <LinkIcon className="size-6" />
          </div>
          <p className="text-sm">{linkError}</p>
          <p className="mt-1 text-sm text-muted-foreground">Reset links work once and expire after one hour.</p>
        </div>
        <Button asChild size="lg" className="mt-6 w-full">
          <Link to="/forgot-password">Request a new link</Link>
        </Button>
      </AuthLayout>
    )
  }

  if (done) {
    return (
      <AuthLayout title="Password updated">
        <div className="rounded-2xl border bg-card p-6 text-center shadow-soft">
          <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
            <CheckCircle2 className="size-6" />
          </div>
          <p className="text-sm text-muted-foreground">Your password has been changed and all other sessions were signed out.</p>
        </div>
        <Button size="lg" className="mt-6 w-full" onClick={() => navigate('/login', { replace: true })}>
          Continue to sign in
        </Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="Use something you have not used here before.">
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
          <Input type="password" autoComplete="new-password" {...fieldAria('newPassword', errors.newPassword?.message)} {...register('newPassword')} />
        </Field>
        <PasswordMeter password={watch('newPassword') ?? ''} />
        <Field label="Confirm password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input type="password" autoComplete="new-password" {...fieldAria('confirm', errors.confirm?.message)} {...register('confirm')} />
        </Field>
        <Button type="submit" size="lg" className="w-full" loading={isSubmitting}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}

// Change password (forced on first login, and from the profile page) -------------
const changeSchema = z
  .object({ currentPassword: z.string().min(1, 'Enter your current password'), newPassword: passwordPolicy, confirm: z.string() })
  .refine((v) => v.newPassword === v.confirm, { message: 'Passwords do not match', path: ['confirm'] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: 'Choose a different password', path: ['newPassword'] })

export function ChangePasswordForm({ onDone, submitLabel = 'Update password' }: { onDone: (profile: Profile) => void; submitLabel?: string }) {
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof changeSchema>>({ resolver: zodResolver(changeSchema) })

  const onSubmit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      // The server returns a fresh session: the password change revoked the old one.
      const { data } = await request<{ data: Session }>('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } })
      sessionStore.set(data)
      reset()
      onDone(data.profile)
    } catch (error) {
      if (error instanceof ApiError && error.details?.some((d) => d.path === 'currentPassword')) {
        setError('currentPassword', { message: 'Current password is incorrect' })
      } else toast.error(errorMessage(error))
    }
  })

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <Field label="Current password" htmlFor="currentPassword" error={errors.currentPassword?.message}>
        <Input type="password" autoComplete="current-password" {...fieldAria('currentPassword', errors.currentPassword?.message)} {...register('currentPassword')} />
      </Field>
      <Field label="New password" htmlFor="newPassword" error={errors.newPassword?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria('newPassword', errors.newPassword?.message)} {...register('newPassword')} />
      </Field>
      <PasswordMeter password={watch('newPassword') ?? ''} />
      <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message}>
        <Input type="password" autoComplete="new-password" {...fieldAria('confirm', errors.confirm?.message)} {...register('confirm')} />
      </Field>
      <Button type="submit" loading={isSubmitting}>
        <KeyRound /> {submitLabel}
      </Button>
    </form>
  )
}

export function ForcedChangePasswordPage() {
  const { user, updateUser, logout } = useAuth()
  const navigate = useNavigate()
  if (!user) return null
  return (
    <AuthLayout title="Set your password" subtitle={`Welcome, ${user.fullName.split(' ')[0]}. Replace your temporary password before continuing.`}>
      <ChangePasswordForm
        submitLabel="Save and continue"
        onDone={(profile) => {
          updateUser(profile)
          toast.success('Password updated')
          navigate(homePath(profile.role), { replace: true })
        }}
      />
      <Button variant="ghost" className="mt-4 w-full" onClick={() => void logout()}>
        Sign out
      </Button>
    </AuthLayout>
  )
}
