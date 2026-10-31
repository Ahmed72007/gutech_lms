import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { Download, MessageSquarePlus, MessageSquareWarning, Search, ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { z } from 'zod'
import { ComplaintChip, PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, SheetContent } from '@/components/ui/dialog'
import { FileDrop } from '@/components/ui/file-drop'
import { Field, fieldAria, Input, Select, Textarea } from '@/components/ui/input'
import { Avatar, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useAdminComplaints, useUpdateComplaint } from '@/features/admin/api'
import { useMyCourses } from '@/features/courses/api'
import { apiForm, apiGet, apiPage, apiSend, downloadSigned, errorMessage } from '@/lib/api'
import { useDebounced } from '@/lib/hooks'
import type { Complaint, ComplaintCategory, ComplaintStatus } from '@/lib/types'
import { formatDateTime, timeAgo } from '@/lib/utils'

const CATEGORIES: Array<{ value: ComplaintCategory; label: string }> = [
  { value: 'academic', label: 'Academic' },
  { value: 'technical', label: 'Technical' },
  { value: 'facility', label: 'Facility' },
  { value: 'conduct', label: 'Conduct' },
  { value: 'other', label: 'Other' },
]
const STATUSES: Array<{ value: ComplaintStatus; label: string }> = [
  { value: 'open', label: 'Open' },
  { value: 'in_review', label: 'In review' },
  { value: 'resolved', label: 'Resolved' },
  { value: 'rejected', label: 'Rejected' },
]
const NEXT: Record<ComplaintStatus, ComplaintStatus[]> = { open: ['in_review'], in_review: ['resolved', 'rejected'], resolved: [], rejected: [] }

const schema = z.object({
  category: z.enum(['academic', 'technical', 'facility', 'conduct', 'other']),
  courseId: z.string(),
  subject: z.string().trim().min(3, 'At least 3 characters').max(200),
  description: z.string().trim().min(10, 'Please give a little more detail (10+ characters)').max(5000),
})
type Values = z.infer<typeof schema>

function RaiseComplaintDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const courses = useMyCourses()
  const [file, setFile] = useState<File | null>(null)
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { category: 'academic', courseId: '' } })
  const create = useMutation({
    mutationFn: (values: Values) => {
      const form = new FormData()
      form.append('category', values.category)
      form.append('subject', values.subject)
      form.append('description', values.description)
      if (values.courseId) form.append('courseId', values.courseId)
      if (file) form.append('attachment', file)
      return apiForm<Complaint>('POST', '/complaints', form)
    },
    onSuccess: () => {
      toast.success('Complaint submitted. We will keep you posted.')
      void qc.invalidateQueries({ queryKey: ['complaints'] })
      reset()
      setFile(null)
      onOpenChange(false)
    },
    onError: (e) => toast.error(errorMessage(e)),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Raise a complaint</DialogTitle>
          <DialogDescription>Only you and the admin team can see it. You cannot edit it after filing.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit((v) => create.mutate(v))} noValidate className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="c-category">
              <Select id="c-category" {...register('category')}>
                {CATEGORIES.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Related course" htmlFor="c-course" hint="Optional">
              <Select id="c-course" {...register('courseId')}>
                <option value="">None</option>
                {courses.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} · {c.title}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Subject" htmlFor="c-subject" error={errors.subject?.message} required>
            <Input {...fieldAria('c-subject', errors.subject?.message)} {...register('subject')} />
          </Field>
          <Field label="Description" htmlFor="c-description" error={errors.description?.message} required>
            <Textarea rows={5} {...fieldAria('c-description', errors.description?.message)} {...register('description')} />
          </Field>
          <div>
            <p className="mb-1.5 text-sm font-medium">Attachment (optional)</p>
            <FileDrop file={file} onFile={setFile} accept=".pdf,.png,.jpg,.jpeg,.gif,.webp" maxBytes={10 * 1024 * 1024} hint="PDF or image · up to 10 MB" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={create.isPending}>
              Submit complaint
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ComplaintDetail({ complaint: c, admin }: { complaint: Complaint; admin?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <ComplaintChip status={c.status} />
        <Badge variant="outline" className="capitalize">
          {c.category}
        </Badge>
        {c.course && <Badge variant="neutral">{c.course.code}</Badge>}
      </div>
      {admin && c.raisedBy && (
        <div className="flex items-center gap-3 rounded-xl border p-3">
          <Avatar name={c.raisedBy.fullName} />
          <div className="min-w-0">
            <p className="truncate font-medium">{c.raisedBy.fullName}</p>
            <p className="truncate text-xs capitalize text-muted-foreground">
              {c.raisedBy.role} · {c.raisedBy.email}
            </p>
          </div>
        </div>
      )}
      <div>
        <p className="text-xs text-muted-foreground">Filed {formatDateTime(c.createdAt)}</p>
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{c.description}</p>
      </div>
      {c.hasAttachment && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => void downloadSigned(`/complaints/${c.id}/attachment`).catch((e: unknown) => toast.error(errorMessage(e)))}
        >
          <Download /> {c.attachmentName ?? 'Attachment'}
        </Button>
      )}
      {c.adminResponse && (
        <div className="rounded-xl border border-primary/30 bg-primary-soft/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-primary">
            <ShieldCheck className="size-4" /> Admin response
          </p>
          <p className="mt-1.5 whitespace-pre-line text-sm">{c.adminResponse}</p>
          {c.resolvedBy && <p className="mt-2 text-xs text-muted-foreground">— {c.resolvedBy.fullName}</p>}
        </div>
      )}
    </div>
  )
}

export function MyComplaintsPage() {
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ComplaintStatus | ''>('')
  const [raising, setRaising] = useState(false)
  const openId = params.get('open')
  const query = useQuery({
    queryKey: ['complaints', 'mine', page, status],
    queryFn: () => apiPage<Complaint>('/complaints/mine', { page, pageSize: 15, status }),
    placeholderData: keepPreviousData,
  })
  const detail = useQuery({ queryKey: ['complaints', 'detail', openId], queryFn: () => apiGet<Complaint>(`/complaints/${openId}`), enabled: Boolean(openId) })
  const qc = useQueryClient()

  // Opening the page clears complaint status notices.
  useEffect(() => {
    apiSend('POST', '/notifications/read', {})
      .then(() => qc.invalidateQueries({ queryKey: ['notifications'] }))
      .catch(() => undefined)
  }, [qc])

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="My complaints"
        description="Raise an issue and follow its progress. You will be notified when its status changes."
        actions={
          <>
            <Select value={status} onChange={(e) => setStatus(e.target.value as ComplaintStatus | '')} aria-label="Filter by status" className="w-40">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </Select>
            <Button onClick={() => setRaising(true)}>
              <MessageSquarePlus /> Raise a complaint
            </Button>
          </>
        }
      />
      <QueryState
        query={query}
        loading={<ListSkeleton rows={4} />}
        isEmpty={(r) => r.data.length === 0}
        empty={
          <EmptyState
            icon={MessageSquareWarning}
            title="No complaints"
            description="If something isn't right — academic, technical or facility — let us know."
            action={<Button onClick={() => setRaising(true)}>Raise a complaint</Button>}
          />
        }
      >
        {({ data, meta }) => (
          <>
            <ul className="space-y-3">
              {data.map((c) => (
                <li key={c.id}>
                  <button
                    onClick={() => setParams({ open: c.id })}
                    className="flex w-full items-center gap-4 rounded-xl border bg-card p-4 text-left shadow-soft transition hover:border-primary/40 hover:shadow-lift"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{c.subject}</p>
                      <p className="text-xs capitalize text-muted-foreground">
                        {c.category}
                        {c.course && ` · ${c.course.code}`} · {timeAgo(c.createdAt)}
                      </p>
                    </div>
                    <ComplaintChip status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      <RaiseComplaintDialog open={raising} onOpenChange={setRaising} />
      <Dialog open={Boolean(openId)} onOpenChange={(o) => !o && setParams({})}>
        <SheetContent aria-describedby={undefined}>
          <div className="p-6">
            <DialogPrimitive.Title className="mb-5 pr-8 font-display text-xl font-semibold">{detail.data?.subject ?? 'Complaint'}</DialogPrimitive.Title>
            {detail.isPending ? <ListSkeleton rows={3} /> : detail.isError ? <p className="text-sm text-danger">{errorMessage(detail.error)}</p> : <ComplaintDetail complaint={detail.data} />}
          </div>
        </SheetContent>
      </Dialog>
    </>
  )
}

function AdminComplaintDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const detail = useQuery({ queryKey: ['complaints', 'detail', id], queryFn: () => apiGet<Complaint>(`/complaints/${id}`) })
  const update = useUpdateComplaint()
  const [response, setResponse] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => setResponse(detail.data?.adminResponse ?? ''), [detail.data?.adminResponse])

  async function move(status: ComplaintStatus) {
    setError(null)
    if ((status === 'resolved' || status === 'rejected') && !response.trim()) {
      setError('Write a response before resolving or rejecting.')
      return
    }
    try {
      await update.mutateAsync({ id, status, adminResponse: response.trim() || undefined })
      void detail.refetch()
    } catch (e) {
      setError(errorMessage(e))
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <SheetContent aria-describedby={undefined}>
        <div className="flex h-full flex-col p-6">
          <DialogPrimitive.Title className="mb-5 pr-8 font-display text-xl font-semibold">{detail.data?.subject ?? 'Complaint'}</DialogPrimitive.Title>
          {detail.isPending ? (
            <ListSkeleton rows={3} />
          ) : detail.isError ? (
            <p className="text-sm text-danger">{errorMessage(detail.error)}</p>
          ) : (
            <>
              <ComplaintDetail complaint={detail.data} admin />
              {NEXT[detail.data.status].length > 0 && (
                <div className="mt-6 space-y-3 border-t pt-6">
                  <Field label="Response to the complainant" htmlFor="admin-response" hint="Required when resolving or rejecting." error={error ?? undefined}>
                    <Textarea id="admin-response" rows={5} value={response} onChange={(e) => setResponse(e.target.value)} maxLength={5000} />
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    {NEXT[detail.data.status].map((s) => (
                      <Button
                        key={s}
                        variant={s === 'rejected' ? 'danger' : s === 'resolved' ? 'default' : 'outline'}
                        onClick={() => void move(s)}
                        loading={update.isPending && update.variables?.status === s}
                      >
                        {s === 'in_review' ? 'Start review' : s === 'resolved' ? 'Resolve' : 'Reject'}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Dialog>
  )
}

export function AdminComplaintsPage() {
  const [params, setParams] = useSearchParams()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<ComplaintStatus | ''>('')
  const [category, setCategory] = useState<ComplaintCategory | ''>('')
  const [search, setSearch] = useState('')
  const debounced = useDebounced(search.trim())
  const query = useAdminComplaints({ page, status, category, search: debounced })
  const openId = params.get('open')

  return (
    <>
      <PageHeader eyebrow="Admin" title="Complaints queue" description="Review, respond and resolve. Complainants are notified on every status change." />
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by subject" className="pl-9" aria-label="Search complaints" />
        </div>
        <Select value={status} onChange={(e) => (setStatus(e.target.value as ComplaintStatus | ''), setPage(1))} aria-label="Status">
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
        <Select value={category} onChange={(e) => (setCategory(e.target.value as ComplaintCategory | ''), setPage(1))} aria-label="Category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </Select>
      </div>
      <QueryState
        query={query}
        loading={<ListSkeleton rows={6} />}
        isEmpty={(r) => r.data.length === 0}
        empty={<EmptyState icon={ShieldCheck} title="Nothing in the queue" description="No complaints match these filters." />}
      >
        {({ data, meta }) => (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>Subject</Th>
                    <Th className="hidden md:table-cell">Raised by</Th>
                    <Th className="hidden sm:table-cell">Category</Th>
                    <Th>Status</Th>
                    <Th className="hidden lg:table-cell">Filed</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.id} className="cursor-pointer transition hover:bg-muted/50" onClick={() => setParams({ open: c.id })}>
                      <Td>
                        <button className="text-left font-medium hover:text-primary" onClick={() => setParams({ open: c.id })}>
                          {c.subject}
                        </button>
                        {c.course && <span className="ml-2 text-xs text-muted-foreground">{c.course.code}</span>}
                      </Td>
                      <Td className="hidden md:table-cell">
                        <span className="text-sm">{c.raisedBy?.fullName}</span>
                        <span className="block text-xs capitalize text-muted-foreground">{c.raisedBy?.role}</span>
                      </Td>
                      <Td className="hidden capitalize sm:table-cell">{c.category}</Td>
                      <Td>
                        <ComplaintChip status={c.status} />
                      </Td>
                      <Td className="hidden text-muted-foreground lg:table-cell">{timeAgo(c.createdAt)}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      {openId && <AdminComplaintDrawer id={openId} onClose={() => setParams({})} />}
    </>
  )
}
