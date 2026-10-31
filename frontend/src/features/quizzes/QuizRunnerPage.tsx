import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Circle, Flag, Send, Square, SquareCheck, Timer, Trophy } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { formatDuration, useCountdown } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress, Skeleton } from '@/components/ui/primitives'
import { ErrorState } from '@/components/ui/states'
import { errorMessage } from '@/lib/api'
import type { AttemptPayload, AttemptResult } from '@/lib/types'
import { cn, formatMarks } from '@/lib/utils'
import { startAttempt, submitAttempt } from './api'

/** Answers survive an accidental refresh (per attempt, this device only). */
const storageKey = (attemptId: string) => `quiz-answers:${attemptId}`

function loadAnswers(attemptId: string): Record<string, string[]> {
  try {
    return JSON.parse(sessionStorage.getItem(storageKey(attemptId)) ?? '{}') as Record<string, string[]>
  } catch {
    return {}
  }
}

export function QuizRunnerPage() {
  const { quizId = '' } = useParams()
  const qc = useQueryClient()
  const [attempt, setAttempt] = useState<AttemptPayload | null>(null)
  const [loadError, setLoadError] = useState<unknown>(null)
  const [answers, setAnswers] = useState<Record<string, string[]>>({})
  const [flagged, setFlagged] = useState<Set<string>>(new Set())
  const [index, setIndex] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<AttemptResult | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const submittedRef = useRef(false)

  const begin = useCallback(async () => {
    setLoadError(null)
    try {
      const payload = await startAttempt(quizId)
      setAttempt(payload)
      setAnswers(loadAnswers(payload.attemptId))
    } catch (error) {
      setLoadError(error)
    }
  }, [quizId])

  useEffect(() => {
    void begin()
  }, [begin])

  // Server clock offset keeps the countdown honest even if the device clock is wrong.
  const offset = useMemo(() => (attempt ? new Date(attempt.serverTime).getTime() - Date.now() : 0), [attempt])
  const remaining = useCountdown(attempt?.expiresAt ?? null, offset)

  const submit = useCallback(async () => {
    if (!attempt || submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    setSubmitError(null)
    try {
      const r = await submitAttempt(quizId, answers)
      sessionStorage.removeItem(storageKey(attempt.attemptId))
      setResult(r)
      setConfirming(false)
      void qc.invalidateQueries({ queryKey: ['quizzes', quizId] })
      void qc.invalidateQueries({ queryKey: ['courses'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    } catch (error) {
      submittedRef.current = false
      setSubmitError(errorMessage(error))
    } finally {
      setSubmitting(false)
    }
  }, [attempt, answers, quizId, qc])

  // Auto-submit when the timer reaches zero.
  useEffect(() => {
    if (attempt && !result && remaining <= 0) void submit()
  }, [attempt, remaining, result, submit])

  // Warn before leaving mid-attempt.
  useEffect(() => {
    if (!attempt || result) return
    const handler = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [attempt, result])

  function choose(questionId: string, optionId: string, multi: boolean) {
    setAnswers((prev) => {
      const current = prev[questionId] ?? []
      const next = multi ? (current.includes(optionId) ? current.filter((o) => o !== optionId) : [...current, optionId]) : [optionId]
      const updated = { ...prev, [questionId]: next }
      if (attempt) sessionStorage.setItem(storageKey(attempt.attemptId), JSON.stringify(updated))
      return updated
    })
  }

  if (loadError) {
    return (
      <div className="mx-auto max-w-xl">
        <ErrorState error={loadError} onRetry={() => void begin()} />
        <Button asChild variant="ghost" className="mt-4 w-full">
          <Link to={`/quizzes/${quizId}`}>
            <ArrowLeft /> Back to quiz
          </Link>
        </Button>
      </div>
    )
  }
  if (!attempt) return <Skeleton className="mx-auto h-96 max-w-3xl" />

  if (result) {
    const pct = result.totalMarks > 0 ? (result.score / result.totalMarks) * 100 : 0
    return (
      <div className="mx-auto max-w-xl animate-fade-up">
        <Card className="overflow-hidden">
          <div className="hero-surface p-8 text-center">
            <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-success-soft text-success">
              <Trophy className="size-8" />
            </div>
            <h1 className="text-2xl font-bold">{result.expired ? 'Time is up' : 'Quiz submitted'}</h1>
            <p className="mt-4 font-display text-6xl font-bold">
              {formatMarks(result.score)}
              <span className="text-2xl text-muted-foreground">/{formatMarks(result.totalMarks)}</span>
            </p>
            <Progress value={pct} className="mx-auto mt-5 max-w-xs" tone={pct >= 50 ? 'success' : 'danger'} />
            <p className="mt-3 text-sm text-muted-foreground">
              {result.correctCount} of {result.questionCount} questions fully correct
            </p>
            {result.expired && <p className="mt-2 text-sm text-warning">Your attempt passed the time limit, so unanswered questions scored 0.</p>}
          </div>
          <CardContent className="p-5">
            <Button asChild className="w-full">
              <Link to={`/quizzes/${quizId}`}>Done</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const questions = attempt.questions
  const q = questions[index]
  const answeredCount = questions.filter((x) => (answers[x.id] ?? []).length > 0).length
  const lowTime = remaining < 60_000
  if (!q) return null
  const multi = q.type === 'mcq_multi'

  return (
    <div className="mx-auto max-w-5xl">
      <div className="sticky top-16 z-20 -mx-4 mb-6 border-b bg-background/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-display font-semibold">{attempt.title}</p>
            <p className="text-xs text-muted-foreground">
              {answeredCount}/{questions.length} answered
            </p>
          </div>
          <div
            className={cn('flex items-center gap-2 rounded-xl px-3 py-2 font-display text-lg font-bold tabular-nums', lowTime ? 'animate-pulse bg-danger-soft text-danger' : 'bg-muted')}
            role="timer"
            aria-live={lowTime ? 'assertive' : 'off'}
            aria-label={`Time remaining ${formatDuration(remaining)}`}
          >
            <Timer className="size-5" /> {formatDuration(remaining)}
          </div>
          <Button onClick={() => setConfirming(true)} className="hidden sm:inline-flex">
            <Send /> Submit
          </Button>
        </div>
        <Progress value={(answeredCount / questions.length) * 100} className="mt-3 h-1.5" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_240px]">
        <Card className="animate-fade-up" key={q.id}>
          <CardContent className="p-5 sm:p-8">
            <div className="mb-4 flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-muted-foreground">
                Question {index + 1} of {questions.length} · {formatMarks(q.marks)} marks
              </span>
              <Button
                variant={flagged.has(q.id) ? 'accent' : 'ghost'}
                size="sm"
                onClick={() =>
                  setFlagged((f) => {
                    const next = new Set(f)
                    if (next.has(q.id)) next.delete(q.id)
                    else next.add(q.id)
                    return next
                  })
                }
                aria-pressed={flagged.has(q.id)}
              >
                <Flag /> {flagged.has(q.id) ? 'Flagged' : 'Flag'}
              </Button>
            </div>
            <h2 className="text-lg font-semibold leading-snug sm:text-xl">{q.prompt}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{multi ? 'Select all that apply.' : 'Select one answer.'}</p>
            <div className="mt-6 space-y-2.5" role={multi ? 'group' : 'radiogroup'} aria-label="Answer options">
              {q.options.map((o) => {
                const selected = (answers[q.id] ?? []).includes(o.id)
                const Marker = multi ? (selected ? SquareCheck : Square) : selected ? CheckCircle2 : Circle
                return (
                  <button
                    key={o.id}
                    type="button"
                    role={multi ? 'checkbox' : 'radio'}
                    aria-checked={selected}
                    onClick={() => choose(q.id, o.id, multi)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-xl border-2 p-4 text-left text-sm font-medium transition sm:text-base',
                      selected ? 'border-primary bg-primary-soft' : 'border-border hover:border-primary/40 hover:bg-muted/50',
                    )}
                  >
                    <Marker className={cn('size-5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
                    {o.text}
                  </button>
                )
              })}
            </div>
            <div className="mt-8 flex items-center justify-between gap-2">
              <Button variant="outline" onClick={() => setIndex((i) => Math.max(0, i - 1))} disabled={index === 0}>
                <ArrowLeft /> Previous
              </Button>
              {index < questions.length - 1 ? (
                <Button onClick={() => setIndex((i) => i + 1)}>
                  Next <ArrowRight />
                </Button>
              ) : (
                <Button onClick={() => setConfirming(true)}>
                  <Send /> Review & submit
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <aside className="lg:sticky lg:top-44 lg:self-start">
          <Card>
            <CardContent className="p-4">
              <p className="mb-3 text-sm font-semibold">Questions</p>
              <nav className="grid grid-cols-6 gap-2 lg:grid-cols-5" aria-label="Question navigator">
                {questions.map((x, i) => {
                  const answered = (answers[x.id] ?? []).length > 0
                  return (
                    <button
                      key={x.id}
                      onClick={() => setIndex(i)}
                      aria-current={i === index ? 'step' : undefined}
                      aria-label={`Question ${i + 1}${answered ? ', answered' : ''}${flagged.has(x.id) ? ', flagged' : ''}`}
                      className={cn(
                        'relative grid aspect-square place-items-center rounded-lg border text-sm font-semibold transition',
                        i === index && 'ring-2 ring-primary ring-offset-2 ring-offset-card',
                        answered ? 'border-primary bg-primary text-primary-foreground' : 'hover:bg-muted',
                      )}
                    >
                      {i + 1}
                      {flagged.has(x.id) && <span className="absolute -right-1 -top-1 size-2.5 rounded-full bg-accent ring-2 ring-card" />}
                    </button>
                  )
                })}
              </nav>
              <Button className="mt-4 w-full sm:hidden" onClick={() => setConfirming(true)}>
                <Send /> Submit
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      <Dialog open={confirming} onOpenChange={(o) => !submitting && setConfirming(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit your answers?</DialogTitle>
            <DialogDescription>You cannot change your answers after submitting. You only get one attempt.</DialogDescription>
          </DialogHeader>
          {answeredCount < questions.length && (
            <p className="flex items-start gap-2 rounded-xl bg-warning-soft p-3 text-sm">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
              {questions.length - answeredCount} question(s) are unanswered and will score 0.
            </p>
          )}
          {submitError && (
            <p role="alert" className="mt-3 text-sm font-medium text-danger">
              {submitError}
            </p>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={submitting}>
              Keep working
            </Button>
            <Button onClick={() => void submit()} loading={submitting}>
              Submit now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
