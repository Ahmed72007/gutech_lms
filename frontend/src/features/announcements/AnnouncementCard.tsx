import { Globe2, MoreHorizontal, Pencil, Pin, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { RoleBadge } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/primitives'
import type { Announcement } from '@/lib/types'
import { cn, timeAgo } from '@/lib/utils'

export function AnnouncementCard({
  announcement: a,
  canEdit,
  onEdit,
  onDelete,
  compact,
}: {
  announcement: Announcement
  canEdit?: boolean
  onEdit?: () => void
  onDelete?: () => void
  compact?: boolean
}) {
  return (
    <article
      className={cn(
        'relative rounded-xl border bg-card p-4 shadow-soft transition sm:p-5',
        a.isPinned && 'border-accent/40 bg-gradient-to-br from-accent-soft/60 to-card',
        !a.isRead && 'ring-1 ring-primary/30',
      )}
    >
      <div className="flex items-start gap-3">
        <Avatar name={a.author?.fullName ?? 'Staff'} className="size-9" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">{a.author?.fullName ?? 'Staff'}</span>
            {a.author && <RoleBadge role={a.author.role} />}
            <span aria-hidden>·</span>
            <time dateTime={a.createdAt}>{timeAgo(a.createdAt)}</time>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {a.isPinned && (
              <Badge variant="accent">
                <Pin /> Pinned
              </Badge>
            )}
            {a.course ? (
              <Link to={`/courses/${a.course.id}`}>
                <Badge variant="outline" className="hover:border-primary hover:text-primary">
                  {a.course.code}
                </Badge>
              </Link>
            ) : (
              <Badge variant="info">
                <Globe2 /> Everyone
              </Badge>
            )}
            {!a.isRead && <Badge variant="default">New</Badge>}
          </div>
          <h3 className="mt-2 font-display text-base font-semibold sm:text-lg">{a.title}</h3>
          <p className={cn('mt-1 whitespace-pre-line text-sm leading-relaxed text-muted-foreground', compact && 'line-clamp-2')}>{a.body}</p>
        </div>
        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-sm" aria-label="Announcement actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={onEdit}>
                <Pencil /> Edit
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
                <Trash2 className="!text-danger" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </article>
  )
}
