import { ChevronRight, ListChecks, Plus, Timer } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { QuizWindowChip } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { useCourseQuizzes } from '@/features/courses/api'
import type { Quiz } from '@/lib/types'
import { formatDateTime, formatMarks, pluralize } from '@/lib/utils'

function StudentQuizStatus({ quiz }: { quiz: Quiz }) {
  const attempt = quiz.myAttempt
  if (attempt?.status === 'submitted' || attempt?.status === 'expired') {
    return (
      <span className="font-display text-sm font-bold tabular-nums">
        {formatMarks(attempt.score)}/{formatMarks(quiz.totalMarks)}
      </span>
    )
  }
  if (attempt?.status === 'in_progress') return <Badge variant="warning">In progress</Badge>
  return <QuizWindowChip window={quiz.window} />
}

export function QuizzesTab({ courseId, canManage }: { courseId: string; canManage: boolean }) {
  const [page, setPage] = useState(1)
  const query = useCourseQuizzes(courseId, page)
  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button asChild>
            <Link to={`/courses/${courseId}/quizzes/new`}>
              <Plus /> New quiz
            </Link>
          </Button>
        </div>
      )}
      <QueryState
        query={query}
        loading={<ListSkeleton rows={3} />}
        isEmpty={(r) => r.data.length === 0}
        empty={
          <EmptyState
            icon={ListChecks}
            title="No quizzes yet"
            description={canManage ? 'Build a timed quiz with single-answer, multi-answer and true/false questions.' : 'Published quizzes will appear here.'}
          />
        }
      >
        {({ data, meta }) => (
          <>
            <ul className="grid gap-3 md:grid-cols-2">
              {data.map((q) => (
                <li key={q.id}>
                  <Link
                    to={`/quizzes/${q.id}`}
                    className="group flex h-full items-center gap-4 rounded-xl border bg-card p-4 shadow-soft transition hover:border-primary/40 hover:shadow-lift"
                  >
                    <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                      <Timer className="size-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{q.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {q.timeLimitMinutes} min · {pluralize(q.questionCount ?? 0, 'question')} · {formatMarks(q.totalMarks)} marks
                      </p>
                      <p className="text-xs text-muted-foreground">Closes {formatDateTime(q.closesAt)}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {canManage ? (
                        <>
                          <QuizWindowChip window={q.window} />
                          <span className="text-xs text-muted-foreground">{pluralize(q.attemptCount ?? 0, 'attempt')}</span>
                        </>
                      ) : (
                        <StudentQuizStatus quiz={q} />
                      )}
                    </div>
                    <ChevronRight className="size-5 text-muted-foreground transition group-hover:translate-x-0.5" />
                  </Link>
                </li>
              ))}
            </ul>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </div>
  )
}
