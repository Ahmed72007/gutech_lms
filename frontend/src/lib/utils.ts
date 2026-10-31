import { clsx, type ClassValue } from 'clsx'
import { differenceInMinutes, format, formatDistanceToNowStrict, isThisYear, isToday, isTomorrow, isYesterday } from 'date-fns'
import { twMerge } from 'tailwind-merge'
import type { Role } from './types'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(iso: string): string {
  const date = new Date(iso)
  return format(date, isThisYear(date) ? 'd MMM' : 'd MMM yyyy')
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso)
  if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`
  if (isTomorrow(date)) return `Tomorrow, ${format(date, 'HH:mm')}`
  if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`
  return format(date, isThisYear(date) ? 'EEE d MMM, HH:mm' : 'd MMM yyyy, HH:mm')
}

export function timeAgo(iso: string): string {
  const date = new Date(iso)
  if (Math.abs(differenceInMinutes(new Date(), date)) < 1) return 'just now'
  return formatDistanceToNowStrict(date, { addSuffix: true })
}

/** "in 2 days", "3 hours ago" relative to now. */
export function relativeDue(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true })
}

/** Value for <input type="datetime-local"> in the user's timezone. */
export function toLocalInput(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function fromLocalInput(value: string): string {
  return new Date(value).toISOString()
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

export const roleLabel: Record<Role, string> = { admin: 'Admin', teacher: 'Teacher', student: 'Student' }

export function homePath(role: Role): string {
  return `/${role}`
}

export function pluralize(count: number, word: string, plural = `${word}s`): string {
  return `${count} ${count === 1 ? word : plural}`
}

export function formatMarks(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—'
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')
}

/** Simple password strength score 0-4 for the meter. Policy itself is enforced by the server. */
export function passwordStrength(password: string): { score: 0 | 1 | 2 | 3 | 4; label: string } {
  let score = 0
  if (password.length >= 10) score += 1
  if (password.length >= 14) score += 1
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1
  if (/\d/.test(password) && /[^A-Za-z0-9]/.test(password)) score += 1
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) score = Math.min(score, 1)
  const labels = ['Too weak', 'Weak', 'Fair', 'Good', 'Strong']
  const s = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
  return { score: s, label: labels[s] ?? 'Too weak' }
}
