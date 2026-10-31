import { CheckCircle2, Clock, Download, FileText, MessageSquareText, Paperclip, Pencil, Send, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { Countdown, PageHeader, SubmissionChip } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm'
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, FileDrop, MAX_DOCUMENT_BYTES } from '@/components/ui/file-drop'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Avatar, Skeleton, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/states'
import { downloadSigned, errorMessage } from '@/lib/api'
import type { AssignmentDetail, SubmissionRow } from '@/lib/types'
import { cn, formatDateTime, formatMarks, timeAgo } from '@/lib/utils'
import { AssignmentFormDialog } from './AssignmentFormDialog'
import { useAssignment, useDeleteAssignment, useGrade, useSubmissions, useSubmit } from './api'

async function download(path: string) {
  try {
    await downloadSigned(path)
  } catch (e) {
    toast.error(errorMessage(e))
  }
}

export function AssignmentPage() {
  const { assignmentId = '' } = useParams()
  const query = useAssignment(assignmentId)

  if (query.isPending) {
    return (
      <div aria-busy="true" className="space-y-4">
        <Skeleton className="h-24" />
        <Skeleton className="h-64" />
      </div>
    )
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const a = query.data
  return (
    <div className="animate-fade-up">
      <PageHeader
        back={{ to: `/courses/${a.courseId}?tab=assignments`, label: `${a.course.code} assignments` }}
        eyebrow="Assignment"
        title={a.title}
        actions={a.viewer.canManage ? <ManageActions assignment={a} /> : a.status && <SubmissionChip status={a.status} overdue={new Date(a.dueAt) < new Date()} />}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Instructions</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="whitespace-pre-line text-sm leading-relaxed">{a.instructions}</p>
              {a.hasAttachment && (
                <Button variant="outline" className="mt-5" onClick={() => void download(`/assignments/${a.id}/attachment`)}>
                  <Paperclip /> {a.attachmentName ?? 'Attachment'}
                </Button>
              )}
            </CardContent>
          </Card>
          {a.viewer.canManage && <GradingTable assignment={a} />}
        </div>
        <aside className="space-y-6">
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:p-6">
              <div>
                <p className="text-xs text-muted-foreground">Due</p>
                <p className="mt-1 text-sm font-semibold">{formatDateTime(a.dueAt)}</p>
                <p className="text-xs">
                  <Countdown to={a.dueAt} prefix="in" />
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Max marks</p>
                <p className="mt-1 font-display text-2xl font-bold">{formatMarks(a.maxMarks)}</p>
              </div>
              <div className="col-span-2">
                {a.allowLate ? <Badge variant="warning">Late submissions accepted (flagged)</Badge> : <Badge variant="neutral">No late submissions</Badge>}
              </div>
              {a.stats && (
                <div className="col-span-2 text-sm text-muted-foreground">
                  {a.stats.submitted} submitted · {a.stats.graded} graded
                </div>
              )}
            </CardContent>
          </Card>
          {a.viewer.isStudent && <StudentSubmission assignment={a} />}
        </aside>
      </div>
    </div>
  )
}

function ManageActions({ assignment }: { assignment: AssignmentDetail }) {
  const navigate = useNavigate()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const remove = useDeleteAssignment(assignment.courseId)
  return (
    <>
      <Button variant="outline" onClick={() => setEditing(true)}>
        <Pencil /> Edit
      </Button>
      <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
        <Trash2 /> Delete
      </Button>
      <AssignmentFormDialog courseId={assignment.courseId} assignment={assignment} open={editing} onOpenChange={setEditing} />
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this assignment?"
        description="All submissions and grades for it will be permanently deleted."
        confirmLabel="Delete assignment"
        tone="danger"
        onConfirm={async () => {
          await remove.mutateAsync(assignment.id)
          navigate(`/courses/${assignment.courseId}?tab=assignments`, { replace: true })
        }}
      />
    </>
  )
}

function StudentSubmission({ assignment: a }: { assignment: AssignmentDetail }) {
  const submit = useSubmit(a.id)
  const sub = a.mySubmission
  const [text, setText] = useState(sub?.textAnswer ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [removeFile, setRemoveFile] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [editing, setEditing] = useState(!sub)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(sub?.textAnswer ?? '')
  }, [sub?.textAnswer])

  const closed = new Date(a.dueAt) < new Date() && !a.allowLate

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    const hasFile = Boolean(file) || (sub?.hasFile && !removeFile)
    if (!text.trim() && !hasFile) return setError('Add a written answer or attach a file.')
    const form = new FormData()
    form.append('textAnswer', text)
    if (file) form.append('file', file)
    if (removeFile && !file) form.append('removeFile', 'true')
    setError(null)
    setProgress(file ? 0 : null)
    try {
      await submit.mutateAsync({ form, onProgress: setProgress })
      setFile(null)
      setRemoveFile(false)
      setEditing(false)
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setProgress(null)
    }
  }

  return (
    <Card className={cn(sub?.status === 'graded' && 'border-success/40')}>
      <CardHeader>
        <CardTitle>Your submission</CardTitle>
        {sub && (
          <CardDescription>
            Submitted {timeAgo(sub.submittedAt)}
            {sub.isLate && ' · late'}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {sub?.status === 'graded' && (
          <div className="rounded-xl bg-success-soft p-4">
            <div className="flex items-center gap-2 text-success">
              <CheckCircle2 className="size-5" />
              <span className="font-display text-2xl font-bold">
                {formatMarks(sub.marksObtained)}
                <span className="text-base font-medium">/{formatMarks(a.maxMarks)}</span>
              </span>
            </div>
            {sub.feedback && (
              <p className="mt-2 flex gap-2 text-sm">
                <MessageSquareText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <span className="whitespace-pre-line">{sub.feedback}</span>
              </p>
            )}
          </div>
        )}

        {!editing && sub ? (
          <>
            {sub.textAnswer && <p className="whitespace-pre-line rounded-xl border bg-muted/30 p-3 text-sm">{sub.textAnswer}</p>}
            {sub.hasFile && (
              <Button variant="outline" size="sm" onClick={() => void download(`/submissions/${sub.id}/download`)}>
                <Download /> {sub.fileName}
              </Button>
            )}
            {!closed ? (
              <Button variant="outline" className="w-full" onClick={() => setEditing(true)}>
                <Pencil /> Resubmit
              </Button>
            ) : (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="size-3.5" /> The deadline has passed.
              </p>
            )}
            {!closed && sub.status === 'graded' && <p className="text-xs text-muted-foreground">Resubmitting clears your current grade.</p>}
          </>
        ) : closed ? (
          <EmptyState icon={Clock} title="Submissions are closed" description="The deadline has passed and late work is not accepted." className="py-8" />
        ) : (
          <form onSubmit={onSubmit} className="space-y-4">
            <Field label="Written answer" htmlFor="answer" hint="Optional if you attach a file">
              <Textarea id="answer" rows={6} value={text} onChange={(e) => setText(e.target.value)} maxLength={20000} />
            </Field>
            {sub?.hasFile && !removeFile && !file ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
                <FileText className="size-4 text-primary" />
                <span className="flex-1 truncate">{sub.fileName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveFile(true)}>
                  Replace
                </Button>
              </div>
            ) : (
              <FileDrop file={file} onFile={setFile} accept={DOCUMENT_ACCEPT} maxBytes={MAX_DOCUMENT_BYTES} hint={DOCUMENT_HINT} progress={progress} disabled={submit.isPending} />
            )}
            {new Date(a.dueAt) < new Date() && <Badge variant="warning">This will be marked late</Badge>}
            {error && (
              <p role="alert" className="text-sm font-medium text-danger">
                {error}
              </p>
            )}
            <div className="flex gap-2">
              {sub && (
                <Button type="button" variant="outline" onClick={() => setEditing(false)}>
                  Cancel
                </Button>
              )}
              <Button type="submit" className="flex-1" loading={submit.isPending}>
                <Send /> {sub ? 'Resubmit' : 'Submit'}
              </Button>
            </div>
          </form>
        )}
      </CardContent>
    </Card>
  )
}

function GradeRow({ row, assignment, highlight }: { row: SubmissionRow; assignment: AssignmentDetail; highlight: boolean }) {
  const grade = useGrade(assignment.id)
  const s = row.submission
  const [marks, setMarks] = useState(s?.marksObtained?.toString() ?? '')
  const [feedback, setFeedback] = useState(s?.feedback ?? '')
  const dirty = s !== null && (marks !== (s.marksObtained?.toString() ?? '') || feedback !== (s.feedback ?? ''))
  const value = Number(marks)
  const invalid = marks !== '' && (!Number.isFinite(value) || value < 0 || value > assignment.maxMarks)

  return (
    <tr className={cn('transition-colors', highlight && 'bg-primary-soft/50')}>
      <Td className="min-w-48">
        <div className="flex items-center gap-3">
          <Avatar name={row.student.fullName} className="size-8" />
          <div className="min-w-0">
            <p className="truncate font-medium">{row.student.fullName}</p>
            <p className="truncate text-xs text-muted-foreground">{row.student.rollNo ?? row.student.email}</p>
          </div>
        </div>
      </Td>
      <Td>
        <SubmissionChip status={row.status} overdue={!s && new Date(assignment.dueAt) < new Date()} />
        {s && <p className="mt-1 text-xs text-muted-foreground">{formatDateTime(s.submittedAt)}</p>}
      </Td>
      <Td className="min-w-40">
        {s?.hasFile ? (
          <Button variant="outline" size="sm" onClick={() => void download(`/submissions/${s.id}/download`)}>
            <Download /> <span className="max-w-28 truncate">{s.fileName}</span>
          </Button>
        ) : s?.textAnswer ? (
          <details className="text-xs">
            <summary className="cursor-pointer font-medium text-primary">View answer</summary>
            <p className="mt-2 max-w-xs whitespace-pre-line">{s.textAnswer}</p>
          </details>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
        {s?.hasFile && s.textAnswer && (
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer font-medium text-primary">View text</summary>
            <p className="mt-2 max-w-xs whitespace-pre-line">{s.textAnswer}</p>
          </details>
        )}
      </Td>
      <Td className="min-w-72">
        {s ? (
          <form
            className="flex items-start gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (invalid || marks === '') return
              grade.mutate({ submissionId: s.id, marks: value, feedback })
            }}
          >
            <div className="w-20 shrink-0">
              <Input
                type="number"
                inputMode="decimal"
                min={0}
                max={assignment.maxMarks}
                step="0.5"
                value={marks}
                onChange={(e) => setMarks(e.target.value)}
                aria-label={`Marks for ${row.student.fullName}`}
                aria-invalid={invalid || undefined}
                className="h-9"
              />
              <p className="mt-0.5 text-center text-[11px] text-muted-foreground">/ {formatMarks(assignment.maxMarks)}</p>
            </div>
            <Input value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Feedback" aria-label={`Feedback for ${row.student.fullName}`} className="h-9" />
            <Button type="submit" size="sm" className="h-9" disabled={!dirty || invalid || marks === ''} loading={grade.isPending}>
              Save
            </Button>
          </form>
        ) : (
          <span className="text-xs text-muted-foreground">Not submitted</span>
        )}
      </Td>
    </tr>
  )
}

function GradingTable({ assignment }: { assignment: AssignmentDetail }) {
  const [page, setPage] = useState(1)
  const [params] = useSearchParams()
  const highlight = params.get('student')
  const query = useSubmissions(assignment.id, page, true)

  return (
    <section>
      <h2 className="mb-3 font-display text-lg font-semibold">Submissions & grading</h2>
      {query.isPending ? (
        <Skeleton className="h-64" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState title="No students enrolled" description="Students enrolled in this course will appear here." />
      ) : (
        <>
          <TableWrap>
            <Table>
              <thead>
                <tr>
                  <Th>Student</Th>
                  <Th>Status</Th>
                  <Th>Work</Th>
                  <Th>Marks & feedback</Th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((row) => (
                  <GradeRow key={`${row.student.id}-${row.submission?.submittedAt ?? ''}`} row={row} assignment={assignment} highlight={row.student.id === highlight} />
                ))}
              </tbody>
            </Table>
          </TableWrap>
          <Pagination page={query.data.meta.page} pageSize={query.data.meta.pageSize} total={query.data.meta.total} onPage={setPage} />
        </>
      )}
    </section>
  )
}
