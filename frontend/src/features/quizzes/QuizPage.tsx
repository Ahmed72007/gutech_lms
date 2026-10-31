import { CalendarRange, CheckCircle2, Clock, ListChecks, Pencil, PlayCircle, Shuffle, Trash2, Trophy } from 'lucide-react'
import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader, QuizWindowChip, StatCard } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ConfirmDialog } from '@/components/ui/confirm'
import { Avatar, Progress, Skeleton, Switch, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ErrorState, Pagination } from '@/components/ui/states'
import type { Quiz } from '@/lib/types'
import { formatDateTime, formatMarks, pluralize } from '@/lib/utils'
import { useDeleteQuiz, usePublishQuiz, useQuiz, useQuizResults } from './api'

export function QuizPage() {
  const { quizId = '' } = useParams()
  const query = useQuiz(quizId)
  if (query.isPending) return <Skeleton className="h-96" />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const quiz = query.data
  return quiz.viewer?.canManage ? <ManagerView quiz={quiz} /> : <StudentView quiz={quiz} />
}

function QuizFacts({ quiz }: { quiz: Quiz }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <Clock className="size-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">Time limit</p>
          <p className="font-semibold">{quiz.timeLimitMinutes} minutes</p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <ListChecks className="size-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">Questions</p>
          <p className="font-semibold">
            {quiz.questionCount ?? quiz.questions?.length ?? 0} · {formatMarks(quiz.totalMarks)} marks
          </p>
        </div>
      </div>
      <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
        <CalendarRange className="size-5 text-primary" />
        <div>
          <p className="text-xs text-muted-foreground">Window</p>
          <p className="text-sm font-semibold">
            {formatDateTime(quiz.opensAt)} → {formatDateTime(quiz.closesAt)}
          </p>
        </div>
      </div>
    </div>
  )
}

function StudentView({ quiz }: { quiz: Quiz }) {
  const attempt = quiz.myAttempt
  const done = attempt?.status === 'submitted' || attempt?.status === 'expired'
  const pct = done && quiz.totalMarks > 0 ? ((attempt?.score ?? 0) / quiz.totalMarks) * 100 : 0
  return (
    <div className="mx-auto max-w-3xl animate-fade-up">
      <PageHeader
        back={{ to: `/courses/${quiz.courseId}?tab=quizzes`, label: `${quiz.course?.code ?? 'Course'} quizzes` }}
        eyebrow="Quiz"
        title={quiz.title}
        description={quiz.description ?? undefined}
        actions={<QuizWindowChip window={quiz.window} />}
      />
      <QuizFacts quiz={quiz} />
      <Card className="mt-6 overflow-hidden">
        {done ? (
          <div className="hero-surface p-8 text-center">
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
              <Trophy className="size-8" />
            </div>
            <p className="text-sm text-muted-foreground">Your score</p>
            <p className="font-display text-5xl font-bold">
              {formatMarks(attempt?.score)}
              <span className="text-2xl text-muted-foreground">/{formatMarks(quiz.totalMarks)}</span>
            </p>
            <Progress value={pct} className="mx-auto mt-5 max-w-xs" tone={pct >= 50 ? 'success' : 'danger'} />
            <p className="mt-3 text-sm text-muted-foreground">
              {attempt?.status === 'expired' ? 'Time ran out before you submitted.' : `Submitted ${formatDateTime(attempt?.submittedAt ?? '')}`}
            </p>
          </div>
        ) : (
          <CardContent className="p-6 text-center sm:p-8">
            <h2 className="font-display text-xl font-semibold">{attempt ? 'Resume your attempt' : 'Ready when you are'}</h2>
            <ul className="mx-auto mt-4 max-w-md space-y-2 text-left text-sm text-muted-foreground">
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> You get <strong className="text-foreground">one attempt</strong>.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> The timer keeps running even if you close the page.
              </li>
              <li className="flex gap-2">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" /> Answers are submitted automatically when time runs out.
              </li>
            </ul>
            {quiz.window === 'open' || attempt?.status === 'in_progress' ? (
              <Button asChild size="lg" className="mt-6">
                <Link to={`/quizzes/${quiz.id}/take`}>
                  <PlayCircle /> {attempt ? 'Resume quiz' : 'Start quiz'}
                </Link>
              </Button>
            ) : (
              <p className="mt-6 text-sm font-medium text-muted-foreground">
                {quiz.window === 'upcoming' ? `Opens ${formatDateTime(quiz.opensAt)}` : 'This quiz has closed.'}
              </p>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function ManagerView({ quiz }: { quiz: Quiz }) {
  const navigate = useNavigate()
  const publish = usePublishQuiz(quiz)
  const remove = useDeleteQuiz(quiz.courseId)
  const [page, setPage] = useState(1)
  const [deleting, setDeleting] = useState(false)
  const results = useQuizResults(quiz.id, page, true)
  const attempts = quiz.attemptCount ?? 0

  return (
    <div className="animate-fade-up">
      <PageHeader
        back={{ to: `/courses/${quiz.courseId}?tab=quizzes`, label: `${quiz.course?.code ?? 'Course'} quizzes` }}
        eyebrow="Quiz"
        title={quiz.title}
        description={quiz.description ?? undefined}
        actions={
          <>
            <label className="flex items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium">
              Published
              <Switch checked={quiz.isPublished} onCheckedChange={(v) => publish.mutate(v)} disabled={publish.isPending} aria-label="Published" />
            </label>
            <Button asChild variant="outline">
              <Link to={`/quizzes/${quiz.id}/edit`}>
                <Pencil /> {attempts > 0 ? 'View' : 'Edit'}
              </Link>
            </Button>
            {attempts === 0 && (
              <Button variant="danger-ghost" onClick={() => setDeleting(true)}>
                <Trash2 /> Delete
              </Button>
            )}
          </>
        }
      />
      <QuizFacts quiz={quiz} />
      <div className="mt-4 flex flex-wrap gap-2">
        <QuizWindowChip window={quiz.window} />
        {quiz.shuffleQuestions && (
          <Badge variant="outline">
            <Shuffle /> Shuffled order
          </Badge>
        )}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_320px]">
        <section>
          <h2 className="mb-3 font-display text-lg font-semibold">Results</h2>
          {results.isPending ? (
            <Skeleton className="h-48" />
          ) : results.isError ? (
            <ErrorState error={results.error} onRetry={() => void results.refetch()} />
          ) : results.data.data.length === 0 ? (
            <EmptyState title="No students enrolled" />
          ) : (
            <>
              <TableWrap>
                <Table>
                  <thead>
                    <tr>
                      <Th>Student</Th>
                      <Th>Status</Th>
                      <Th className="text-right">Score</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.data.data.map((r) => (
                      <tr key={r.student.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <Avatar name={r.student.fullName} className="size-8" />
                            <div className="min-w-0">
                              <p className="truncate font-medium">{r.student.fullName}</p>
                              <p className="text-xs text-muted-foreground">{r.student.rollNo ?? r.student.email}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {!r.attempt ? (
                            <Badge variant="neutral">Not attempted</Badge>
                          ) : r.attempt.status === 'in_progress' ? (
                            <Badge variant="warning">In progress</Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">{formatDateTime(r.attempt.submittedAt ?? r.attempt.expiresAt)}</span>
                          )}
                        </Td>
                        <Td className="text-right font-display font-bold tabular-nums">
                          {r.attempt?.score !== null && r.attempt?.score !== undefined ? `${formatMarks(r.attempt.score)}/${formatMarks(results.data.meta.totalMarks)}` : '—'}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </TableWrap>
              <Pagination page={results.data.meta.page} pageSize={results.data.meta.pageSize} total={results.data.meta.total} onPage={setPage} />
            </>
          )}
        </section>
        <aside className="space-y-4">
          <StatCard icon={ListChecks} label="Attempts" value={attempts} hint={pluralize(quiz.questions?.length ?? 0, 'question')} />
          <Card>
            <CardHeader>
              <CardTitle>Questions</CardTitle>
            </CardHeader>
            <CardContent>
              <ol className="space-y-2 text-sm">
                {quiz.questions?.map((q, i) => (
                  <li key={q.id} className="flex gap-2">
                    <span className="font-semibold text-muted-foreground">{i + 1}.</span>
                    <span className="line-clamp-2 flex-1">{q.prompt}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatMarks(q.marks)}</span>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title="Delete this quiz?"
        description="The quiz and its questions will be permanently removed."
        confirmLabel="Delete quiz"
        tone="danger"
        onConfirm={async () => {
          await remove.mutateAsync(quiz.id)
          navigate(`/courses/${quiz.courseId}?tab=quizzes`, { replace: true })
        }}
      />
    </div>
  )
}
