import { zodResolver } from '@hookform/resolvers/zod'
import { Megaphone, Plus } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, fieldAria, Input, Select, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useAdminCourses } from '@/features/admin/api'
import { useUser } from '@/features/auth/AuthProvider'
import { useMyCourses } from '@/features/courses/api'
import { errorMessage } from '@/lib/api'
import type { Announcement, CourseRef } from '@/lib/types'
import { AnnouncementCard } from './AnnouncementCard'
import { useAnnouncements, useDeleteAnnouncement, useMarkAnnouncementsRead, useSaveAnnouncement } from './api'

/** Courses the current user can filter by / post to. */
function useCourseOptions(): CourseRef[] {
  const user = useUser()
  const mine = useMyCourses(user.role !== 'admin')
  const all = useAdminCourses({ page: 1, search: '', archived: 'false' }, 100, user.role === 'admin')
  const list = user.role === 'admin' ? all.data?.data : mine.data
  return (list ?? []).map((c) => ({ id: c.id, code: c.code, title: c.title }))
}

const schema = z.object({
  courseId: z.string(),
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  body: z.string().trim().min(1, 'Write a message').max(5000),
  isPinned: z.boolean(),
})
type Values = z.infer<typeof schema>

function AnnouncementDialog({
  open,
  onOpenChange,
  announcement,
  fixedCourseId,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  announcement?: Announcement
  fixedCourseId?: string
}) {
  const user = useUser()
  const courses = useCourseOptions()
  const save = useSaveAnnouncement(announcement?.id)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      courseId: announcement?.courseId ?? fixedCourseId ?? (user.role === 'admin' ? '' : (courses[0]?.id ?? '')),
      title: announcement?.title ?? '',
      body: announcement?.body ?? '',
      isPinned: announcement?.isPinned ?? false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    if (!values.courseId && user.role !== 'admin') return setError('Choose one of your courses.')
    try {
      await save.mutateAsync({ ...values, courseId: values.courseId || null })
      reset()
      onOpenChange(false)
    } catch (e) {
      setError(errorMessage(e))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{announcement ? 'Edit announcement' : 'New announcement'}</DialogTitle>
          <DialogDescription>Students see it in their feed with an unread badge.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          {!announcement && !fixedCourseId && (
            <Field label="Audience" htmlFor="ann-course">
              <Select id="ann-course" {...register('courseId')}>
                {user.role === 'admin' && <option value="">Everyone (global)</option>}
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Title" htmlFor="ann-title" error={errors.title?.message} required>
            <Input {...fieldAria('ann-title', errors.title?.message)} {...register('title')} />
          </Field>
          <Field label="Message" htmlFor="ann-body" error={errors.body?.message} required>
            <Textarea rows={5} {...fieldAria('ann-body', errors.body?.message)} {...register('body')} />
          </Field>
          <Controller
            control={control}
            name="isPinned"
            render={({ field }) => (
              <label className="flex items-center justify-between rounded-xl border p-3.5 text-sm">
                <span>
                  <span className="block font-medium">Pin to top</span>
                  <span className="text-xs text-muted-foreground">Pinned items always appear first.</span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Pin to top" />
              </label>
            )}
          />
          {error && (
            <p role="alert" className="text-sm font-medium text-danger">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {announcement ? 'Save' : 'Post'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** Paginated feed (pinned first). Reused on the course overview tab. */
export function AnnouncementsFeed({ courseId, canPost, scope }: { courseId?: string; canPost?: boolean; scope?: 'all' | 'global' }) {
  const user = useUser()
  const [page, setPage] = useState(1)
  const query = useAnnouncements({ page, courseId, scope })
  const remove = useDeleteAnnouncement()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [deleting, setDeleting] = useState<Announcement | null>(null)

  useEffect(() => setPage(1), [courseId, scope])

  return (
    <div>
      {canPost && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New announcement
          </Button>
        </div>
      )}
      <QueryState
        query={query}
        loading={<ListSkeleton rows={3} />}
        isEmpty={(r) => r.data.length === 0}
        empty={<EmptyState icon={Megaphone} title="No announcements" description="When there is news, it shows up here." />}
      >
        {({ data, meta }) => (
          <>
            <div className="space-y-3">
              {data.map((a) => (
                <AnnouncementCard
                  key={a.id}
                  announcement={a}
                  canEdit={user.role === 'admin' || a.author?.id === user.id}
                  onEdit={() => setEditing(a)}
                  onDelete={() => setDeleting(a)}
                />
              ))}
            </div>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <AnnouncementDialog open={creating} onOpenChange={setCreating} fixedCourseId={courseId} />
      <AnnouncementDialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)} announcement={editing ?? undefined} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete announcement?"
        description="It will disappear from everyone's feed."
        confirmLabel="Delete"
        tone="danger"
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.id) : undefined)}
      />
    </div>
  )
}

export function AnnouncementsPage() {
  const user = useUser()
  const courses = useCourseOptions()
  const markRead = useMarkAnnouncementsRead()
  const [filter, setFilter] = useState('')

  // Opening the feed marks everything visible as read.
  useEffect(() => {
    const id = setTimeout(() => markRead.mutate(), 1500)
    return () => clearTimeout(id)
  }, [])

  return (
    <>
      <PageHeader
        eyebrow="Stay in the loop"
        title="Announcements"
        description="Campus-wide news and updates from your courses."
        actions={
          <Select value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by course" className="w-full sm:w-64">
            <option value="">All announcements</option>
            <option value="global">Global only</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.title}
              </option>
            ))}
          </Select>
        }
      />
      <AnnouncementsFeed
        courseId={filter && filter !== 'global' ? filter : undefined}
        scope={filter === 'global' ? 'global' : 'all'}
        canPost={user.role !== 'student'}
      />
    </>
  )
}
