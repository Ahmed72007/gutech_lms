import { zodResolver } from '@hookform/resolvers/zod'
import { ClipboardList, Plus, Search } from 'lucide-react'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageHeader } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, fieldAria, Input, Select, Textarea } from '@/components/ui/input'
import { CardGridSkeleton, EmptyState, Pagination, QueryState } from '@/components/ui/states'
import { CourseCard } from '@/features/courses/CourseCard'
import { ApiError, errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { Course } from '@/lib/types'
import { useAdminCourses, useSaveCourse } from './api'

const schema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2,6}\d{2,4}[A-Z]?$/, 'Use a code like CS101'),
  title: z.string().trim().min(3, 'At least 3 characters').max(150),
  description: z.string().trim().max(2000),
})
type Values = z.infer<typeof schema>

export function CourseFormDialog({ course, open, onOpenChange }: { course?: Course; open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate()
  const save = useSaveCourse(course?.id)
  const [error, setError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), values: { code: course?.code ?? '', title: course?.title ?? '', description: course?.description ?? '' } })

  const onSubmit = handleSubmit(async (values) => {
    setError(null)
    try {
      const saved = await save.mutateAsync({ ...values, description: values.description || null })
      onOpenChange(false)
      reset()
      if (!course) navigate(`/admin/courses/${saved.id}`)
    } catch (e) {
      setError(e instanceof ApiError && e.status === 409 ? 'A course with this code already exists.' : errorMessage(e))
    }
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{course ? 'Edit course' : 'New course'}</DialogTitle>
          <DialogDescription>Courses are archived, never deleted.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[140px_1fr]">
            <Field label="Code" htmlFor="c-code" error={errors.code?.message} required>
              <Input className="uppercase" {...fieldAria('c-code', errors.code?.message)} {...register('code')} />
            </Field>
            <Field label="Title" htmlFor="c-title" error={errors.title?.message} required>
              <Input {...fieldAria('c-title', errors.title?.message)} {...register('title')} />
            </Field>
          </div>
          <Field label="Description" htmlFor="c-desc" error={errors.description?.message}>
            <Textarea rows={4} {...fieldAria('c-desc', errors.description?.message)} {...register('description')} />
          </Field>
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
              {course ? 'Save' : 'Create course'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function CoursesAdminPage() {
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [archived, setArchived] = useState<'true' | 'false' | 'all'>('false')
  const debounced = useDebounced(search.trim())
  const query = useAdminCourses({ page, search: debounced, archived })
  const [creating, setCreating] = useState(false)

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Courses"
        description="Create courses, assign teachers and enroll students."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New course
          </Button>
        }
      />
      <div className="mb-5 grid gap-2 sm:grid-cols-[1fr_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => {
              setSearch(e.target.value)
              setPage(1)
            }}
            placeholder="Search code or title"
            className="pl-9"
            aria-label="Search courses"
          />
        </div>
        <Select value={archived} onChange={(e) => (setArchived(e.target.value as typeof archived), setPage(1))} aria-label="Archive filter">
          <option value="false">Active</option>
          <option value="true">Archived</option>
          <option value="all">All courses</option>
        </Select>
      </div>
      <QueryState
        query={query}
        loading={<CardGridSkeleton count={6} />}
        isEmpty={(r) => r.data.length === 0}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No courses"
            description="Create the first course to start assigning teachers and students."
            action={<Button onClick={() => setCreating(true)}>New course</Button>}
          />
        }
      >
        {({ data, meta }) => (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {data.map((c) => (
                <CourseCard key={c.id} course={c} showStudents to={`/admin/courses/${c.id}`} />
              ))}
            </div>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <CourseFormDialog open={creating} onOpenChange={setCreating} />
    </>
  )
}
