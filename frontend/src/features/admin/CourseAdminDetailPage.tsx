import { Archive, ArchiveRestore, Check, ExternalLink, FileSpreadsheet, GraduationCap, Pencil, Search, UserMinus, UserPlus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FileDrop } from '@/components/ui/file-drop'
import { Input } from '@/components/ui/input'
import { Avatar, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { EmptyState, ErrorState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { AdminUser, Course, EnrollmentReport, RosterStudent } from '@/lib/types'
import { cn, formatDate, pluralize } from '@/lib/utils'
import { CourseFormDialog } from './CoursesAdminPage'
import { useAdminCourse, useEnroll, useRoster, useSaveCourse, useSetTeachers, useUnenroll, useUsers } from './api'

/** Searchable multi-select of users by role. */
function UserPicker({
  role,
  selected,
  onToggle,
  exclude,
}: {
  role: 'teacher' | 'student'
  selected: Map<string, AdminUser>
  onToggle: (user: AdminUser) => void
  exclude?: Set<string>
}) {
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const query = useUsers({ page: 1, search: debounced, role, status: 'active' }, 30)
  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Search ${role}s`} className="pl-9" aria-label={`Search ${role}s`} />
      </div>
      <div className="scrollbar-thin mt-3 max-h-72 overflow-y-auto rounded-xl border">
        {query.isPending ? (
          <ListSkeleton rows={3} className="p-2" />
        ) : query.isError ? (
          <p className="p-4 text-sm text-danger">{errorMessage(query.error)}</p>
        ) : query.data.data.filter((u) => !exclude?.has(u.id)).length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No matching {role}s.</p>
        ) : (
          <ul className="divide-y">
            {query.data.data
              .filter((u) => !exclude?.has(u.id))
              .map((u) => {
                const isSelected = selected.has(u.id)
                return (
                  <li key={u.id}>
                    <button
                      type="button"
                      onClick={() => onToggle(u)}
                      aria-pressed={isSelected}
                      className={cn('flex w-full items-center gap-3 p-3 text-left transition', isSelected ? 'bg-primary-soft' : 'hover:bg-muted')}
                    >
                      <Avatar name={u.fullName} className="size-8" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{u.fullName}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {u.email}
                          {u.rollNo && ` · ${u.rollNo}`}
                        </span>
                      </span>
                      <span className={cn('grid size-5 place-items-center rounded-md border', isSelected && 'border-primary bg-primary text-primary-foreground')}>
                        {isSelected && <Check className="size-3.5" />}
                      </span>
                    </button>
                  </li>
                )
              })}
          </ul>
        )}
      </div>
    </div>
  )
}

function TeachersTab({ course }: { course: Course }) {
  const setTeachers = useSetTeachers(course.id)
  const [selected, setSelected] = useState(new Map<string, AdminUser>())

  useEffect(() => {
    setSelected(
      new Map(
        course.teachers.map((t) => [t.id, { id: t.id, fullName: t.fullName, email: t.email, role: 'teacher', rollNo: null, isActive: true, mustChangePassword: false, createdAt: '' }]),
      ),
    )
  }, [course.teachers])

  const changed = useMemo(() => {
    const original = new Set(course.teachers.map((t) => t.id))
    return selected.size !== original.size || [...selected.keys()].some((id) => !original.has(id))
  }, [selected, course.teachers])

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Assigned teachers</CardTitle>
          <CardDescription>Teachers manage content and grading for this course.</CardDescription>
        </CardHeader>
        <CardContent>
          {selected.size === 0 ? (
            <p className="text-sm text-muted-foreground">No teachers selected.</p>
          ) : (
            <ul className="space-y-2">
              {[...selected.values()].map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border p-2.5">
                  <Avatar name={t.fullName} className="size-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{t.fullName}</span>
                    <span className="block truncate text-xs text-muted-foreground">{t.email}</span>
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() =>
                      setSelected((s) => {
                        const n = new Map(s)
                        n.delete(t.id)
                        return n
                      })
                    }
                    aria-label={`Remove ${t.fullName}`}
                  >
                    <UserMinus />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <Button className="mt-5 w-full" disabled={!changed} loading={setTeachers.isPending} onClick={() => setTeachers.mutate([...selected.keys()])}>
            Save teacher set
          </Button>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Add teachers</CardTitle>
        </CardHeader>
        <CardContent>
          <UserPicker
            role="teacher"
            selected={selected}
            onToggle={(u) =>
              setSelected((s) => {
                const n = new Map(s)
                if (n.has(u.id)) n.delete(u.id)
                else n.set(u.id, u)
                return n
              })
            }
          />
        </CardContent>
      </Card>
    </div>
  )
}

function ReportView({ report }: { report: EnrollmentReport }) {
  const groups = [
    { label: report.dryRun ? 'Will be enrolled' : 'Enrolled', items: report.matched.map((m) => `${m.fullName} · ${m.email}`), variant: 'success' as const },
    { label: 'Already enrolled', items: report.alreadyEnrolled, variant: 'neutral' as const },
    { label: 'Duplicates in file', items: report.duplicates, variant: 'warning' as const },
    { label: 'Unknown emails', items: report.unknown, variant: 'danger' as const },
    { label: 'Not active students', items: report.notStudents, variant: 'danger' as const },
    { label: 'Invalid entries', items: report.invalid, variant: 'danger' as const },
  ].filter((g) => g.items.length > 0)
  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <details key={g.label} open={g.variant !== 'neutral'} className="rounded-xl border p-3">
          <summary className="flex cursor-pointer items-center justify-between text-sm font-medium">
            {g.label} <Badge variant={g.variant}>{g.items.length}</Badge>
          </summary>
          <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs text-muted-foreground">
            {g.items.map((item) => (
              <li key={item} className="truncate">
                {item}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  )
}

function CsvImportDialog({ courseId, open, onOpenChange }: { courseId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const enroll = useEnroll(courseId)
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<EnrollmentReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  function close() {
    setFile(null)
    setPreview(null)
    setError(null)
    onOpenChange(false)
  }

  async function run(dryRun: boolean) {
    if (!file) return
    setError(null)
    try {
      const report = await enroll.mutateAsync({ csv: file, dryRun })
      if (dryRun) setPreview(report)
      else {
        toast.success(`${pluralize(report.enrolled, 'student')} enrolled`)
        close()
      }
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import students from CSV</DialogTitle>
          <DialogDescription>One email per line or cell. We'll show you a preview before anything is saved.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <FileDrop
            file={file}
            onFile={(f) => {
              setFile(f)
              setPreview(null)
            }}
            accept=".csv,.txt,text/csv"
            maxBytes={1024 * 1024}
            hint="CSV or TXT · up to 1 MB"
          />
          {preview && <ReportView report={preview} />}
          {error && <p className="text-sm font-medium text-danger">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>
            Cancel
          </Button>
          {preview ? (
            <Button onClick={() => void run(false)} loading={enroll.isPending} disabled={preview.matched.length === 0}>
              Enroll {pluralize(preview.matched.length, 'student')}
            </Button>
          ) : (
            <Button onClick={() => void run(true)} loading={enroll.isPending} disabled={!file}>
              Preview import
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StudentsTab({ course }: { course: Course }) {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const roster = useRoster(course.id, page, debounced)
  const enroll = useEnroll(course.id)
  const unenroll = useUnenroll(course.id)
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [selected, setSelected] = useState(new Map<string, AdminUser>())
  const [removing, setRemoving] = useState<RosterStudent | null>(null)
  const enrolledIds = useMemo(() => new Set((roster.data?.data ?? []).map((s) => s.id)), [roster.data])

  return (
    <div>
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search enrolled students"
            className="pl-9"
            aria-label="Search enrolled students"
          />
        </div>
        <Button variant="outline" onClick={() => setImporting(true)}>
          <FileSpreadsheet /> Import CSV
        </Button>
        <Button onClick={() => setAdding(true)}>
          <UserPlus /> Add students
        </Button>
      </div>
      <QueryState
        query={roster}
        loading={<ListSkeleton rows={5} />}
        isEmpty={(r) => r.data.length === 0}
        empty={<EmptyState icon={GraduationCap} title={debounced ? 'No matches' : 'No students enrolled'} description="Add students one by one or import a CSV of emails." />}
      >
        {({ data, meta }) => (
          <>
            <Card>
              <ul className="divide-y">
                {data.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 p-3 sm:p-4">
                    <Avatar name={s.fullName} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{s.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.email}
                        {s.rollNo && ` · ${s.rollNo}`} · enrolled {formatDate(s.enrolledAt)}
                      </p>
                    </div>
                    <Button variant="danger-ghost" size="sm" onClick={() => setRemoving(s)}>
                      <UserMinus /> <span className="hidden sm:inline">Unenroll</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </Card>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>

      <Dialog open={adding} onOpenChange={(o) => (setAdding(o), !o && setSelected(new Map()))}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add students</DialogTitle>
            <DialogDescription>Enrolling a student who is already in the course is harmless.</DialogDescription>
          </DialogHeader>
          <UserPicker
            role="student"
            selected={selected}
            exclude={enrolledIds}
            onToggle={(u) =>
              setSelected((s) => {
                const n = new Map(s)
                if (n.has(u.id)) n.delete(u.id)
                else n.set(u.id, u)
                return n
              })
            }
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)}>
              Cancel
            </Button>
            <Button
              disabled={selected.size === 0}
              loading={enroll.isPending}
              onClick={async () => {
                try {
                  const report = await enroll.mutateAsync({ studentIds: [...selected.keys()], dryRun: false })
                  toast.success(`${pluralize(report.enrolled, 'student')} enrolled`)
                  setSelected(new Map())
                  setAdding(false)
                } catch (e) {
                  toast.error(errorMessage(e))
                }
              }}
            >
              Enroll {selected.size || ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CsvImportDialog courseId={course.id} open={importing} onOpenChange={setImporting} />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Unenroll ${removing?.fullName}?`}
        description="They lose access to the course. Their past submissions are kept."
        confirmLabel="Unenroll"
        tone="danger"
        onConfirm={() => (removing ? unenroll.mutateAsync(removing.id) : undefined)}
      />
    </div>
  )
}

export function CourseAdminDetailPage() {
  const { courseId = '' } = useParams()
  const query = useAdminCourse(courseId)
  const save = useSaveCourse(courseId)
  const [editing, setEditing] = useState(false)
  const [archiving, setArchiving] = useState(false)

  if (query.isPending) return <Skeleton className="h-96" />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const course = query.data

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={{ to: '/admin/courses', label: 'All courses' }}
        eyebrow={
          <span className="flex items-center gap-2">
            {course.code} {course.isArchived && <Badge variant="neutral">Archived</Badge>}
          </span>
        }
        title={course.title}
        description={course.description ?? undefined}
        actions={
          <>
            <Button asChild variant="outline">
              <Link to={`/courses/${course.id}`}>
                <ExternalLink /> Open workspace
              </Link>
            </Button>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil /> Edit
            </Button>
            <Button variant={course.isArchived ? 'outline' : 'danger-ghost'} onClick={() => setArchiving(true)}>
              {course.isArchived ? <ArchiveRestore /> : <Archive />} {course.isArchived ? 'Restore' : 'Archive'}
            </Button>
          </>
        }
      />
      <Tabs defaultValue="students">
        <TabsList>
          <TabsTrigger value="students">
            <GraduationCap /> Students ({course.studentCount})
          </TabsTrigger>
          <TabsTrigger value="teachers">
            <Users /> Teachers ({course.teachers.length})
          </TabsTrigger>
        </TabsList>
        <div className="mt-6">
          <TabsContent value="students">
            <StudentsTab course={course} />
          </TabsContent>
          <TabsContent value="teachers">
            <TeachersTab course={course} />
          </TabsContent>
        </div>
      </Tabs>
      <CourseFormDialog course={course} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={archiving}
        onOpenChange={setArchiving}
        title={course.isArchived ? 'Restore this course?' : 'Archive this course?'}
        description={course.isArchived ? 'Students will see it again.' : 'Students will no longer see it. Nothing is deleted and you can restore it anytime.'}
        confirmLabel={course.isArchived ? 'Restore' : 'Archive'}
        tone={course.isArchived ? 'default' : 'danger'}
        onConfirm={async () => {
          await save.mutateAsync({ isArchived: !course.isArchived })
          toast.success(course.isArchived ? 'Course restored' : 'Course archived')
        }}
      />
    </div>
  )
}
