import {
  BookOpen,
  ClipboardList,
  GraduationCap,
  LayoutDashboard,
  Megaphone,
  MessageCircle,
  MessageSquareWarning,
  ScrollText,
  ShieldAlert,
  UserCircle2,
  Users,
  type LucideIcon,
} from 'lucide-react'
import type { Role } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: LucideIcon
  badge?: 'announcements' | 'notifications'
  /** Compact label for the mobile bottom bar. */
  short?: string
  /** Show in the mobile bottom bar (max 5). */
  mobile?: boolean
}

export const NAV: Record<Role, Array<{ section?: string; items: NavItem[] }>> = {
  student: [
    {
      items: [
        { to: '/student', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, mobile: true },
        { to: '/courses', label: 'My courses', short: 'Courses', icon: BookOpen, mobile: true },
        { to: '/marks', label: 'My marks', short: 'Marks', icon: GraduationCap, mobile: true },
        { to: '/announcements', label: 'Announcements', icon: Megaphone, badge: 'announcements' },
        { to: '/chat', label: 'Classroom chat', short: 'Chat', icon: MessageCircle, mobile: true },
      ],
    },
    { section: 'Support', items: [{ to: '/complaints', label: 'Complaints', icon: MessageSquareWarning, badge: 'notifications' }] },
  ],
  teacher: [
    {
      items: [
        { to: '/teacher', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, mobile: true },
        { to: '/courses', label: 'My classes', short: 'Classes', icon: BookOpen, mobile: true },
        { to: '/announcements', label: 'Announcements', short: 'News', icon: Megaphone, badge: 'announcements', mobile: true },
        { to: '/chat', label: 'Classroom chat', short: 'Chat', icon: MessageCircle, mobile: true },
      ],
    },
    { section: 'Support', items: [{ to: '/complaints', label: 'Complaints', icon: MessageSquareWarning, badge: 'notifications' }] },
  ],
  admin: [
    {
      items: [
        { to: '/admin', label: 'Dashboard', short: 'Home', icon: LayoutDashboard, mobile: true },
        { to: '/admin/users', label: 'Users', icon: Users, mobile: true },
        { to: '/admin/courses', label: 'Courses', icon: ClipboardList, mobile: true },
        { to: '/admin/complaints', label: 'Complaints', icon: ShieldAlert, mobile: true },
      ],
    },
    {
      section: 'Communication',
      items: [
        { to: '/announcements', label: 'Announcements', icon: Megaphone, badge: 'announcements' },
        { to: '/chat', label: 'Classroom chat', icon: MessageCircle },
        { to: '/admin/audit', label: 'Audit log', icon: ScrollText },
      ],
    },
  ],
}

export const PROFILE_ITEM: NavItem = { to: '/profile', label: 'My profile', short: 'Profile', icon: UserCircle2, mobile: true }
