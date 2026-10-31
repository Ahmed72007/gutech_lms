import { ArrowLeft, Moon, Sun, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Badge, StatusDot, type BadgeVariant } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { ComplaintStatus, QuizWindow, Role, SubmissionStatus } from '@/lib/types'
import { cn, passwordStrength, roleLabel } from '@/lib/utils'

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  back,
}: {
  title: ReactNode
  description?: ReactNode
  eyebrow?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
}) {
  return (
    <header className="mb-6 animate-fade-up sm:mb-8">
      {back && (
        <Link to={back.to} className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground transition hover:text-foreground">
          <ArrowLeft className="size-4" /> {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          {eyebrow && <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-primary">{eyebrow}</div>}
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">{title}</h1>
          {description && <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground sm:text-base">{description}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}

export function StatCard({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'primary',
}: {
  icon: LucideIcon
  label: string
  value: ReactNode
  hint?: ReactNode
  tone?: 'primary' | 'accent' | 'info' | 'danger'
}) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    accent: 'bg-accent-soft text-accent',
    info: 'bg-info-soft text-info',
    danger: 'bg-danger-soft text-danger',
  }
  return (
    <div className="group relative overflow-hidden rounded-xl border bg-card p-4 shadow-soft transition hover:-translate-y-0.5 hover:shadow-lift sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground sm:text-sm">{label}</p>
          <p className="mt-1.5 font-display text-2xl font-bold sm:text-3xl">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tones[tone])}>
          <Icon className="size-5" aria-hidden />
        </div>
      </div>
    </div>
  )
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">{title}</h2>
      {action}
    </div>
  )
}

const ROLE_VARIANT: Record<Role, BadgeVariant> = { admin: 'accent', teacher: 'info', student: 'default' }

export function RoleBadge({ role }: { role: Role }) {
  return <Badge variant={ROLE_VARIANT[role]}>{roleLabel[role]}</Badge>
}

const SUBMISSION: Record<SubmissionStatus, { label: string; variant: BadgeVariant }> = {
  pending: { label: 'Pending', variant: 'neutral' },
  submitted: { label: 'Submitted', variant: 'info' },
  late: { label: 'Late', variant: 'warning' },
  graded: { label: 'Graded', variant: 'success' },
}

export function SubmissionChip({ status, overdue }: { status: SubmissionStatus; overdue?: boolean }) {
  if (status === 'pending' && overdue) return <StatusDot variant="danger">Missing</StatusDot>
  const s = SUBMISSION[status]
  return <StatusDot variant={s.variant}>{s.label}</StatusDot>
}

const COMPLAINT: Record<ComplaintStatus, { label: string; variant: BadgeVariant }> = {
  open: { label: 'Open', variant: 'info' },
  in_review: { label: 'In review', variant: 'warning' },
  resolved: { label: 'Resolved', variant: 'success' },
  rejected: { label: 'Rejected', variant: 'danger' },
}

export function ComplaintChip({ status }: { status: ComplaintStatus }) {
  const s = COMPLAINT[status]
  return <StatusDot variant={s.variant}>{s.label}</StatusDot>
}

export const complaintStatusLabel = (status: ComplaintStatus) => COMPLAINT[status].label

const QUIZ: Record<QuizWindow, { label: string; variant: BadgeVariant }> = {
  draft: { label: 'Draft', variant: 'neutral' },
  upcoming: { label: 'Upcoming', variant: 'info' },
  open: { label: 'Open now', variant: 'success' },
  closed: { label: 'Closed', variant: 'outline' },
}

export function QuizWindowChip({ window }: { window: QuizWindow }) {
  const s = QUIZ[window]
  return <StatusDot variant={s.variant}>{s.label}</StatusDot>
}

/** Live countdown to a timestamp ("2d 4h", "12:05"). */
export function useCountdown(target: string | null, offsetMs = 0) {
  const [now, setNow] = useState(() => Date.now() + offsetMs)
  useEffect(() => {
    if (!target) return
    const id = setInterval(() => setNow(Date.now() + offsetMs), 1000)
    return () => clearInterval(id)
  }, [target, offsetMs])
  return target ? new Date(target).getTime() - now : 0
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00'
  const totalSeconds = Math.floor(ms / 1000)
  const days = Math.floor(totalSeconds / 86_400)
  const hours = Math.floor((totalSeconds % 86_400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (days > 0) return `${days}d ${hours}h`
  if (hours > 0) return `${hours}h ${minutes}m`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function Countdown({ to, prefix = 'Due in' }: { to: string; prefix?: string }) {
  const remaining = useCountdown(to)
  if (remaining <= 0) return <span className="font-medium text-danger">Deadline passed</span>
  const urgent = remaining < 24 * 3600 * 1000
  return (
    <span className={cn('font-medium tabular-nums', urgent ? 'text-warning' : 'text-muted-foreground')}>
      {prefix} {formatDuration(remaining)}
    </span>
  )
}

export function PasswordMeter({ password }: { password: string }) {
  const { score, label } = passwordStrength(password)
  if (!password) return null
  const colors = ['bg-danger', 'bg-danger', 'bg-warning', 'bg-primary', 'bg-success']
  return (
    <div className="space-y-1.5" aria-live="polite">
      <div className="flex gap-1">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= score ? colors[score] : 'bg-muted')} />
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Strength: <span className="font-medium text-foreground">{label}</span> · at least 10 characters with a letter and a number
      </p>
    </div>
  )
}

export function useTheme() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggle = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
    try {
      localStorage.setItem('lms-theme', next ? 'dark' : 'light')
    } catch {
      /* storage unavailable */
    }
  }
  return { dark, toggle }
}

export function ThemeToggle({ className }: { className?: string }) {
  const { dark, toggle } = useTheme()
  return (
    <Button variant="ghost" size="icon" onClick={toggle} className={className} aria-label={dark ? 'Switch to light theme' : 'Switch to dark theme'}>
      {dark ? <Sun /> : <Moon />}
    </Button>
  )
}

export function BrandMark({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2.5', className)}>
      <div className="relative grid size-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-teal-700 shadow-glow">
        <svg viewBox="0 0 24 24" className="size-5 text-white" fill="currentColor" aria-hidden>
          <path d="M2.5 9 12 4l9.5 5L12 14z" />
          <path d="M6 11.5v4c0 1.6 2.7 3.5 6 3.5s6-1.9 6-3.5v-4L12 15z" opacity=".75" />
        </svg>
        <span className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-accent ring-2 ring-ink" />
      </div>
      <div className="leading-none">
        <p className="font-display text-[17px] font-bold tracking-tight">GUtech Learn</p>
        <p className="mt-0.5 text-[10px] font-medium uppercase tracking-[0.18em] opacity-60">Internal LMS</p>
      </div>
    </div>
  )
}
