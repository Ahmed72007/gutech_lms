import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Bell, CheckCheck, ChevronsUpDown, KeyRound, LogOut, Megaphone, Menu, UserCircle2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { BrandMark, RoleBadge, ThemeToggle } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Dialog, SheetContent } from '@/components/ui/dialog'
import {
  Avatar,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/primitives'
import { useAuth, useUser } from '@/features/auth/AuthProvider'
import { useMarkAllRead, useRecentActivity, useUnreadCounts } from '@/features/notifications/notifications'
import { cn, timeAgo } from '@/lib/utils'
import { NAV, PROFILE_ITEM, type NavItem } from './nav'

function CountBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null
  return (
    <span className={cn('grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-foreground', className)}>
      {count > 99 ? '99+' : count}
    </span>
  )
}

function SidebarNav({ counts, onNavigate }: { counts: Record<'announcements' | 'notifications', number>; onNavigate?: () => void }) {
  const user = useUser()
  const { logout } = useAuth()
  return (
    <div className="flex h-full flex-col bg-ink text-ink-foreground">
      <div className="px-5 pb-4 pt-6">
        <Link to={`/${user.role}`} onClick={onNavigate} aria-label="Go to dashboard">
          <BrandMark />
        </Link>
      </div>
      <nav className="scrollbar-thin flex-1 space-y-6 overflow-y-auto px-3 py-2" aria-label="Main">
        {NAV[user.role].map((group, i) => (
          <div key={group.section ?? i}>
            {group.section && <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-foreground/45">{group.section}</p>}
            <ul className="space-y-1">
              {group.items.map((item) => (
                <li key={item.to}>
                  <SideLink item={item} count={item.badge ? counts[item.badge] : 0} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <DropdownMenu>
          <DropdownMenuTrigger className="flex w-full items-center gap-3 rounded-xl p-2.5 text-left transition hover:bg-white/5">
            <Avatar name={user.fullName} src={user.avatarUrl} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{user.fullName}</p>
              <p className="truncate text-xs text-ink-foreground/55">{user.email}</p>
            </div>
            <ChevronsUpDown className="size-4 text-ink-foreground/50" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-60">
            <DropdownMenuItem asChild>
              <Link to="/profile" onClick={onNavigate}>
                <UserCircle2 /> My profile
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link to="/profile#security" onClick={onNavigate}>
                <KeyRound /> Change password
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()} className="text-danger focus:text-danger">
              <LogOut className="!text-danger" /> Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function SideLink({ item, count, onNavigate }: { item: NavItem; count: number; onNavigate?: () => void }) {
  const Icon = item.icon
  return (
    <NavLink
      to={item.to}
      end={item.to.split('/').length === 2 && ['/admin', '/teacher', '/student'].includes(item.to)}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition',
          isActive ? 'bg-white/[0.08] text-white' : 'text-ink-foreground/70 hover:bg-white/5 hover:text-white',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary shadow-glow" aria-hidden />}
          <Icon className={cn('size-[18px]', isActive ? 'text-primary' : 'text-ink-foreground/50 group-hover:text-ink-foreground/80')} />
          <span className="flex-1">{item.label}</span>
          <CountBadge count={count} />
        </>
      )}
    </NavLink>
  )
}

function NotificationBell({ total }: { total: number }) {
  const [open, setOpen] = useState(false)
  const activity = useRecentActivity(open)
  const markAll = useMarkAllRead()
  const navigate = useNavigate()
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={`Notifications${total ? `, ${total} unread` : ''}`}>
          <Bell />
          {total > 0 && <span className="absolute right-2 top-2 size-2.5 rounded-full bg-accent ring-2 ring-background" />}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0">
        <div className="flex items-center justify-between border-b px-4 py-3">
          <p className="font-display font-semibold">Notifications</p>
          <Button variant="ghost" size="sm" onClick={() => markAll.mutate()} loading={markAll.isPending} disabled={total === 0}>
            <CheckCheck /> Mark all read
          </Button>
        </div>
        <div className="scrollbar-thin max-h-[60vh] overflow-y-auto p-2">
          {activity.isPending ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : activity.isError ? (
            <p className="p-4 text-sm text-danger">Could not load notifications.</p>
          ) : activity.data.notices.length === 0 && activity.data.announcements.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">You're all caught up.</p>
          ) : (
            <ul className="space-y-0.5">
              {activity.data.notices.map((n) => (
                <li key={n.id}>
                  <button
                    className="flex w-full gap-3 rounded-lg p-2.5 text-left transition hover:bg-muted"
                    onClick={() => {
                      setOpen(false)
                      if (n.link) navigate(n.link)
                    }}
                  >
                    <span className={cn('mt-1.5 size-2 shrink-0 rounded-full', n.readAt ? 'bg-transparent' : 'bg-accent')} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{n.title}</span>
                      {n.body && <span className="line-clamp-2 block text-xs text-muted-foreground">{n.body}</span>}
                      <span className="mt-0.5 block text-[11px] text-muted-foreground">{timeAgo(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
              {activity.data.announcements.map((a) => (
                <li key={a.id}>
                  <button
                    className="flex w-full gap-3 rounded-lg p-2.5 text-left transition hover:bg-muted"
                    onClick={() => {
                      setOpen(false)
                      navigate('/announcements')
                    }}
                  >
                    <Megaphone className={cn('mt-0.5 size-4 shrink-0', a.isRead ? 'text-muted-foreground' : 'text-accent')} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium">{a.title}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {a.course ? a.course.code : 'Everyone'} · {timeAgo(a.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export function AppShell() {
  const user = useUser()
  const location = useLocation()
  const [mobileOpen, setMobileOpen] = useState(false)
  const counts = useUnreadCounts(user.id)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  const mobileItems = [...NAV[user.role].flatMap((g) => g.items).filter((i) => i.mobile), PROFILE_ITEM].slice(0, 5)

  return (
    <div className="min-h-dvh lg:pl-[272px]">
      <a href="#main" className="sr-only z-[60] rounded-md bg-primary px-3 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[272px] lg:block">
        <SidebarNav counts={counts} />
      </aside>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="border-none p-0" aria-describedby={undefined}>
          <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
          <SidebarNav counts={counts} onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Dialog>

      <header className="sticky top-0 z-30 border-b bg-background/80 backdrop-blur-xl">
        <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>
          <Link to={`/${user.role}`} className="lg:hidden">
            <span className="font-display text-lg font-bold">GUtech Learn</span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <div className="mr-2 hidden sm:block">
              <RoleBadge role={user.role} />
            </div>
            <ThemeToggle />
            <NotificationBell total={counts.notifications + counts.announcements} />
            <Link to="/profile" className="ml-1 rounded-full" aria-label="My profile">
              <Avatar name={user.fullName} src={user.avatarUrl} className="size-9 ring-2 ring-border transition hover:ring-primary" />
            </Link>
          </div>
        </div>
      </header>

      <main id="main" className="mx-auto w-full max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 backdrop-blur-xl lg:hidden" aria-label="Quick navigation">
        <ul className="grid" style={{ gridTemplateColumns: `repeat(${mobileItems.length}, minmax(0, 1fr))` }}>
          {mobileItems.map((item) => {
            const Icon = item.icon
            const count = item.badge ? counts[item.badge] : 0
            return (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={['/admin', '/teacher', '/student'].includes(item.to)}
                  className={({ isActive }) =>
                    cn('relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition', isActive ? 'text-primary' : 'text-muted-foreground')
                  }
                >
                  <span className="relative">
                    <Icon className="size-5" />
                    <CountBadge count={count} className="absolute -right-3 -top-2 h-4 min-w-4 px-1 text-[9px]" />
                  </span>
                  <span className="max-w-full truncate px-1">{item.short ?? item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
