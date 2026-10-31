import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { BadgeCheck, Calendar, Camera, IdCard, KeyRound, Loader2, Mail, Phone, ShieldCheck, Trash2, UserRound } from 'lucide-react'
import { useEffect, useRef } from 'react'
import { useForm } from 'react-hook-form'
import { useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { RoleBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, fieldAria, Input, Textarea } from '@/components/ui/input'
import { Avatar } from '@/components/ui/primitives'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { ChangePasswordForm } from '@/features/auth/PasswordPages'
import { apiForm, apiSend, errorMessage } from '@/lib/api'
import type { Profile } from '@/lib/types'
import { formatDate, roleLabel } from '@/lib/utils'

const AVATAR_MAX = 2 * 1024 * 1024

const schema = z.object({
  fullName: z.string().trim().min(2, 'At least 2 characters').max(120),
  phone: z
    .string()
    .trim()
    .max(32)
    .refine((v) => v === '' || /^[+\d][\d\s()-]{5,31}$/.test(v), 'Enter a valid phone number'),
  bio: z.string().trim().max(500, 'Keep it under 500 characters'),
})
type Values = z.infer<typeof schema>

function AvatarEditor({ user }: { user: Profile }) {
  const { updateUser } = useAuth()
  const inputRef = useRef<HTMLInputElement>(null)
  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData()
      form.append('avatar', file)
      return apiForm<Profile>('POST', '/profile/avatar', form)
    },
    onSuccess: (p) => {
      updateUser(p)
      toast.success('Profile photo updated')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const remove = useMutation({
    mutationFn: () => apiSend<Profile>('DELETE', '/profile/avatar'),
    onSuccess: (p) => {
      updateUser(p)
      toast.success('Profile photo removed')
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
  const busy = upload.isPending || remove.isPending

  return (
    <div className="relative w-fit">
      <Avatar name={user.fullName} src={user.avatarUrl} className="size-24 text-2xl ring-4 ring-card sm:size-28" />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={busy}
        className="absolute bottom-0 right-0 grid size-9 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-card transition hover:scale-105"
        aria-label="Change profile photo"
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Camera className="size-4" />}
      </button>
      {user.avatarUrl && (
        <button
          type="button"
          onClick={() => remove.mutate()}
          disabled={busy}
          className="absolute bottom-0 left-0 grid size-8 place-items-center rounded-full bg-card text-danger shadow-lift ring-4 ring-card transition hover:scale-105"
          aria-label="Remove profile photo"
        >
          <Trash2 className="size-3.5" />
        </button>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0]
          e.target.value = ''
          if (!file) return
          if (file.size > AVATAR_MAX) return void toast.error('Choose an image under 2 MB.')
          upload.mutate(file)
        }}
      />
    </div>
  )
}

function InfoRow({ icon: Icon, label, value }: { icon: typeof Mail; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3">
      <div className="grid size-9 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-medium">{value}</p>
      </div>
    </div>
  )
}

export function ProfilePage() {
  const user = useUser()
  const { updateUser } = useAuth()
  const location = useLocation()
  const securityRef = useRef<HTMLDivElement>(null)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema), values: { fullName: user.fullName, phone: user.phone ?? '', bio: user.bio ?? '' } })

  useEffect(() => {
    if (location.hash === '#security') securityRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [location.hash])

  const onSubmit = handleSubmit(async (values) => {
    try {
      const profile = await apiSend<Profile>('PATCH', '/profile', { fullName: values.fullName, phone: values.phone || null, bio: values.bio || null })
      updateUser(profile)
      reset(values)
      toast.success('Profile saved')
    } catch (e) {
      toast.error(errorMessage(e))
    }
  })

  const bio = watch('bio') ?? ''

  return (
    <div className="mx-auto max-w-5xl animate-fade-up">
      <section className="relative mb-6 overflow-hidden rounded-2xl border bg-card shadow-soft">
        <div className="aurora h-28 sm:h-36">
          <div className="grid-pattern h-full opacity-60" />
        </div>
        <div className="flex flex-col gap-4 px-5 pb-6 sm:flex-row sm:items-end sm:px-8">
          <div className="-mt-12 sm:-mt-14">
            <AvatarEditor user={user} />
          </div>
          <div className="min-w-0 flex-1 sm:pb-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold sm:text-3xl">{user.fullName}</h1>
              <RoleBadge role={user.role} />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{user.email}</p>
            {user.bio && <p className="mt-2 max-w-2xl text-sm">{user.bio}</p>}
          </div>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserRound className="size-5 text-primary" /> Personal details
              </CardTitle>
              <CardDescription>Visible to people in your courses.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={onSubmit} noValidate className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Full name" htmlFor="p-name" error={errors.fullName?.message}>
                    <Input autoComplete="name" {...fieldAria('p-name', errors.fullName?.message)} {...register('fullName')} />
                  </Field>
                  <Field label="Phone" htmlFor="p-phone" error={errors.phone?.message} hint="Optional">
                    <Input type="tel" autoComplete="tel" placeholder="+968 9123 4567" {...fieldAria('p-phone', errors.phone?.message)} {...register('phone')} />
                  </Field>
                </div>
                <Field label="About me" htmlFor="p-bio" error={errors.bio?.message} hint={`${bio.length}/500`}>
                  <Textarea rows={4} placeholder="A sentence or two about you" {...fieldAria('p-bio', errors.bio?.message, `${bio.length}/500`)} {...register('bio')} />
                </Field>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" disabled={!isDirty} onClick={() => reset()}>
                    Discard
                  </Button>
                  <Button type="submit" disabled={!isDirty} loading={isSubmitting}>
                    Save changes
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          <div ref={securityRef} id="security" className="scroll-mt-24">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <KeyRound className="size-5 text-primary" /> Change password
                </CardTitle>
                <CardDescription>At least 10 characters, including a letter and a number.</CardDescription>
              </CardHeader>
              <CardContent className="max-w-md">
                <ChangePasswordForm
                  onDone={(p) => {
                    updateUser(p)
                    toast.success('Password changed')
                  }}
                />
              </CardContent>
            </Card>
          </div>
        </div>

        <aside className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <InfoRow icon={Mail} label="Email" value={user.email} />
              <InfoRow icon={BadgeCheck} label="Role" value={roleLabel[user.role]} />
              {user.rollNo && <InfoRow icon={IdCard} label="Roll number" value={user.rollNo} />}
              {user.phone && <InfoRow icon={Phone} label="Phone" value={user.phone} />}
              <InfoRow icon={Calendar} label="Member since" value={formatDate(user.createdAt)} />
            </CardContent>
          </Card>
          <Card className="border-primary/30 bg-primary-soft/40">
            <CardContent className="flex gap-3 p-5">
              <ShieldCheck className="size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Your email, role and roll number are managed by the admin team. Contact them if anything is wrong.
              </p>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  )
}
