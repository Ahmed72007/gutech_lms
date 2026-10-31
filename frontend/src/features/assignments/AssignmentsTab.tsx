import { CalendarClock, ChevronRight, ClipboardList, Plus } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Countdown, SubmissionChip } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useCourseAssignments } from '@/features/courses/api'
import { formatDateTime, formatMarks } from '@/lib/utils'
import { AssignmentFormDialog } from './AssignmentFormDialog'

export function AssignmentsTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [page, setPage] = useState(1)
  const [creating, setCreating] = useState(false)
  const query = useCourseAssignments(courseId, page)

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setCreating(true)}>
            <Plus /> New assignment
          </Button>
        </div>
      )}
      <QueryState
        query={query}
        loading={<ListSkeleton rows={4} />}
        isEmpty={(r) => r.data.length === 0}
        empty={
          <EmptyState
            icon={ClipboardList}
            title="No assignments yet"
            description={canManage ? 'Create an assignment with instructions, a due date and max marks.' : 'Assignments from your teacher will appear here.'}
          />
        }
      >
        {({ data, meta }) => (
          <>
            <ul className="space-y-3">
              {data.map((a) => {
                const overdue = new Date(a.dueAt) < new Date()
                return (
                  <li key={a.id}>
                    <Link
                      to={`/assignments/${a.id}`}
                      className="group flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-soft transition hover:border-primary/40 hover:shadow-lift sm:flex-row sm:items-center"
                    >
                      <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                        <CalendarClock className="size-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold">{a.title}</p>
                          {a.allowLate && <Badge variant="outline">Late OK</Badge>}
                        </div>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Due {formatDateTime(a.dueAt)} · {formatMarks(a.maxMarks)} marks
                        </p>
                        {!overdue && (
                          <p className="mt-0.5 text-xs">
                            <Countdown to={a.dueAt} />
                          </p>
                        )}
                      </div>
                      {a.status ? (
                        <div className="flex items-center gap-3">
                          {a.mySubmission?.status === 'graded' && (
                            <span className="font-display text-sm font-bold tabular-nums">
                              {formatMarks(a.mySubmission.marksObtained)}/{formatMarks(a.maxMarks)}
                            </span>
                          )}
                          <SubmissionChip status={a.status} overdue={overdue} />
                        </div>
                      ) : a.stats ? (
                        <div className="w-full sm:w-44">
                          <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                            <span>{a.stats.submitted} submitted</span>
                            <span>{a.stats.graded} graded</span>
                          </div>
                          <Progress value={a.stats.submitted ? (a.stats.graded / a.stats.submitted) * 100 : 0} />
                        </div>
                      ) : null}
                      <ChevronRight className="hidden size-5 text-muted-foreground transition group-hover:translate-x-0.5 sm:block" />
                    </Link>
                  </li>
                )
              })}
            </ul>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
      {canManage && <AssignmentFormDialog courseId={courseId} open={creating} onOpenChange={setCreating} />}
    </div>
  )
}
