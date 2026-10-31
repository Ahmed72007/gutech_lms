import { ArrowDown, ArrowUp, CheckCircle2, Circle, Copy, Eye, Plus, Save, Square, SquareCheck, Trash2, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { PageHeader } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Field, Input, Select, Textarea } from '@/components/ui/input'
import { Skeleton, Switch } from '@/components/ui/primitives'
import { ErrorState } from '@/components/ui/states'
import { ApiError, errorMessage } from '@/lib/api'
import type { QuestionType } from '@/lib/types'
import { cn, fromLocalInput, toLocalInput } from '@/lib/utils'
import { useQuiz, useSaveQuiz, type QuizInput } from './api'

interface DraftOption {
  id: string
  text: string
}
interface DraftQuestion {
  key: string
  type: QuestionType
  prompt: string
  options: DraftOption[]
  correct: string[]
  marks: number
}

const TF_OPTIONS = [
  { id: 'true', text: 'True' },
  { id: 'false', text: 'False' },
]
const letters = 'abcdefgh'

function newQuestion(type: QuestionType = 'mcq_single'): DraftQuestion {
  return {
    key: crypto.randomUUID(),
    type,
    prompt: '',
    options: type === 'true_false' ? TF_OPTIONS : [{ id: 'a', text: '' }, { id: 'b', text: '' }],
    correct: [],
    marks: 1,
  }
}

function validate(questions: DraftQuestion[]): string | null {
  if (questions.length === 0) return 'Add at least one question.'
  for (const [i, q] of questions.entries()) {
    const n = i + 1
    if (!q.prompt.trim()) return `Question ${n} needs a prompt.`
    if (q.options.some((o) => !o.text.trim())) return `Question ${n} has an empty option.`
    if (q.correct.length === 0) return `Mark the correct answer for question ${n}.`
    if (q.type !== 'mcq_multi' && q.correct.length !== 1) return `Question ${n} must have exactly one correct answer.`
    if (!(q.marks > 0)) return `Question ${n} needs marks greater than 0.`
  }
  return null
}

function QuestionEditor({
  q,
  index,
  count,
  onChange,
  onMove,
  onRemove,
  onDuplicate,
  locked,
}: {
  q: DraftQuestion
  index: number
  count: number
  onChange: (q: DraftQuestion) => void
  onMove: (dir: -1 | 1) => void
  onRemove: () => void
  onDuplicate: () => void
  locked: boolean
}) {
  const multi = q.type === 'mcq_multi'
  function toggleCorrect(id: string) {
    if (multi) onChange({ ...q, correct: q.correct.includes(id) ? q.correct.filter((c) => c !== id) : [...q.correct, id] })
    else onChange({ ...q, correct: [id] })
  }
  function changeType(type: QuestionType) {
    if (type === 'true_false') onChange({ ...q, type, options: TF_OPTIONS, correct: [] })
    else if (q.type === 'true_false') onChange({ ...q, type, options: [{ id: 'a', text: '' }, { id: 'b', text: '' }], correct: [] })
    else onChange({ ...q, type, correct: type === 'mcq_single' ? q.correct.slice(0, 1) : q.correct })
  }
  const prefix = `q${index}`

  return (
    <Card className="animate-fade-up">
      <CardHeader className="flex-row items-center justify-between gap-2 space-y-0">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="grid size-7 place-items-center rounded-lg bg-ink text-xs font-bold text-ink-foreground">{index + 1}</span>
          Question {index + 1}
        </CardTitle>
        {!locked && (
          <div className="flex items-center gap-0.5">
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Move up">
              <ArrowUp />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={() => onMove(1)} disabled={index === count - 1} aria-label="Move down">
              <ArrowDown />
            </Button>
            <Button type="button" variant="ghost" size="icon-sm" onClick={onDuplicate} aria-label="Duplicate question">
              <Copy />
            </Button>
            <Button type="button" variant="danger-ghost" size="icon-sm" onClick={onRemove} aria-label="Delete question">
              <Trash2 />
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_180px_110px]">
          <Field label="Prompt" htmlFor={`${prefix}-prompt`} className="sm:col-span-1">
            <Textarea id={`${prefix}-prompt`} rows={2} value={q.prompt} disabled={locked} onChange={(e) => onChange({ ...q, prompt: e.target.value })} />
          </Field>
          <Field label="Type" htmlFor={`${prefix}-type`}>
            <Select id={`${prefix}-type`} value={q.type} disabled={locked} onChange={(e) => changeType(e.target.value as QuestionType)}>
              <option value="mcq_single">Single answer</option>
              <option value="mcq_multi">Multiple answers</option>
              <option value="true_false">True / false</option>
            </Select>
          </Field>
          <Field label="Marks" htmlFor={`${prefix}-marks`}>
            <Input
              id={`${prefix}-marks`}
              type="number"
              min={0.5}
              step="0.5"
              value={q.marks}
              disabled={locked}
              onChange={(e) => onChange({ ...q, marks: Number(e.target.value) })}
            />
          </Field>
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">
            Options <span className="font-normal text-muted-foreground">— click the marker to set {multi ? 'all correct answers' : 'the correct answer'}</span>
          </legend>
          <ul className="space-y-2">
            {q.options.map((o, oi) => {
              const correct = q.correct.includes(o.id)
              const Marker = multi ? (correct ? SquareCheck : Square) : correct ? CheckCircle2 : Circle
              return (
                <li key={o.id} className={cn('flex items-center gap-2 rounded-xl border p-1.5 pl-2 transition', correct && 'border-success/50 bg-success-soft/50')}>
                  <button
                    type="button"
                    onClick={() => !locked && toggleCorrect(o.id)}
                    className={cn('rounded-md p-1', correct ? 'text-success' : 'text-muted-foreground hover:text-foreground')}
                    aria-pressed={correct}
                    aria-label={`Mark option ${oi + 1} as correct`}
                  >
                    <Marker className="size-5" />
                  </button>
                  <Input
                    value={o.text}
                    disabled={locked || q.type === 'true_false'}
                    onChange={(e) => onChange({ ...q, options: q.options.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })}
                    placeholder={`Option ${oi + 1}`}
                    aria-label={`Option ${oi + 1}`}
                    className="h-9 border-transparent bg-transparent shadow-none"
                  />
                  {q.type !== 'true_false' && q.options.length > 2 && !locked && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => onChange({ ...q, options: q.options.filter((x) => x.id !== o.id), correct: q.correct.filter((c) => c !== o.id) })}
                      aria-label={`Remove option ${oi + 1}`}
                    >
                      <X />
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
          {q.type !== 'true_false' && q.options.length < 8 && !locked && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => {
                const used = new Set(q.options.map((o) => o.id))
                const id = [...letters].find((l) => !used.has(l)) ?? crypto.randomUUID().slice(0, 4)
                onChange({ ...q, options: [...q.options, { id, text: '' }] })
              }}
            >
              <Plus /> Add option
            </Button>
          )}
        </fieldset>
      </CardContent>
    </Card>
  )
}

function Preview({ questions, open, onOpenChange }: { questions: DraftQuestion[]; open: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Student preview</DialogTitle>
        </DialogHeader>
        <ol className="space-y-5">
          {questions.map((q, i) => (
            <li key={q.key}>
              <p className="font-medium">
                {i + 1}. {q.prompt || <em className="text-muted-foreground">No prompt</em>}{' '}
                <span className="text-xs text-muted-foreground">({q.marks} marks)</span>
              </p>
              <ul className="mt-2 space-y-1.5">
                {q.options.map((o) => (
                  <li key={o.id} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                    {q.type === 'mcq_multi' ? <Square className="size-4 text-muted-foreground" /> : <Circle className="size-4 text-muted-foreground" />}
                    {o.text}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </DialogContent>
    </Dialog>
  )
}

export function QuizBuilderPage() {
  const { courseId: routeCourseId, quizId } = useParams()
  const navigate = useNavigate()
  const existing = useQuiz(quizId)
  const courseId = routeCourseId ?? existing.data?.courseId ?? ''
  const save = useSaveQuiz(courseId, quizId)

  const opens = new Date()
  opens.setMinutes(0, 0, 0)
  const closes = new Date(opens.getTime() + 7 * 864e5)
  const [meta, setMeta] = useState({
    title: '',
    description: '',
    timeLimitMinutes: 20,
    opensAt: toLocalInput(opens),
    closesAt: toLocalInput(closes),
    shuffleQuestions: false,
    isPublished: false,
  })
  const [questions, setQuestions] = useState<DraftQuestion[]>([newQuestion()])
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState(false)

  useEffect(() => {
    const q = existing.data
    if (!q) return
    setMeta({
      title: q.title,
      description: q.description ?? '',
      timeLimitMinutes: q.timeLimitMinutes,
      opensAt: toLocalInput(q.opensAt),
      closesAt: toLocalInput(q.closesAt),
      shuffleQuestions: q.shuffleQuestions,
      isPublished: q.isPublished,
    })
    setQuestions(
      (q.questions ?? []).map((x) => ({ key: x.id, type: x.type, prompt: x.prompt, options: x.options, correct: x.correctOptionIds ?? [], marks: x.marks })),
    )
  }, [existing.data])

  if (quizId && existing.isPending) return <Skeleton className="h-96" />
  if (quizId && existing.isError) return <ErrorState error={existing.error} onRetry={() => void existing.refetch()} />

  const locked = (existing.data?.attemptCount ?? 0) > 0
  const total = questions.reduce((sum, q) => sum + (q.marks || 0), 0)

  async function submit(publish: boolean) {
    if (meta.title.trim().length < 3) return setError('Give the quiz a title (3+ characters).')
    if (new Date(meta.closesAt) <= new Date(meta.opensAt)) return setError('Closing time must be after opening time.')
    const problem = validate(questions)
    if (problem) return setError(problem)
    setError(null)
    const input: QuizInput = {
      title: meta.title.trim(),
      description: meta.description.trim() || null,
      timeLimitMinutes: meta.timeLimitMinutes,
      opensAt: fromLocalInput(meta.opensAt),
      closesAt: fromLocalInput(meta.closesAt),
      shuffleQuestions: meta.shuffleQuestions,
      isPublished: publish,
      questions: questions.map((q) => ({ type: q.type, prompt: q.prompt.trim(), options: q.options.map((o) => ({ ...o, text: o.text.trim() })), correctOptionIds: q.correct, marks: q.marks })),
    }
    try {
      const saved = await save.mutateAsync(locked ? { isPublished: publish } : input)
      toast.success(publish ? 'Quiz saved and published' : 'Quiz saved as draft')
      navigate(`/quizzes/${saved.id}`, { replace: true })
    } catch (e) {
      setError(e instanceof ApiError && e.details?.[0] ? `${e.message} (${e.details[0].path}: ${e.details[0].message})` : errorMessage(e))
    }
  }

  return (
    <div className="pb-24">
      <PageHeader
        back={{ to: quizId ? `/quizzes/${quizId}` : `/courses/${courseId}?tab=quizzes`, label: 'Back' }}
        eyebrow="Quiz builder"
        title={quizId ? 'Edit quiz' : 'New quiz'}
        actions={
          <Button variant="outline" onClick={() => setPreview(true)}>
            <Eye /> Preview
          </Button>
        }
      />
      {locked && (
        <div className="mb-4 rounded-xl border border-warning/40 bg-warning-soft p-4 text-sm">
          Students have already attempted this quiz, so questions and settings are locked. You can still publish or unpublish it.
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {questions.map((q, i) => (
            <QuestionEditor
              key={q.key}
              q={q}
              index={i}
              count={questions.length}
              locked={locked}
              onChange={(next) => setQuestions((qs) => qs.map((x) => (x.key === q.key ? next : x)))}
              onRemove={() => setQuestions((qs) => qs.filter((x) => x.key !== q.key))}
              onDuplicate={() => setQuestions((qs) => [...qs.slice(0, i + 1), { ...q, key: crypto.randomUUID() }, ...qs.slice(i + 1)])}
              onMove={(dir) =>
                setQuestions((qs) => {
                  const next = [...qs]
                  const [item] = next.splice(i, 1)
                  if (item) next.splice(i + dir, 0, item)
                  return next
                })
              }
            />
          ))}
          {!locked && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setQuestions((qs) => [...qs, newQuestion('mcq_single')])}>
                <Plus /> Single answer
              </Button>
              <Button variant="outline" onClick={() => setQuestions((qs) => [...qs, newQuestion('mcq_multi')])}>
                <Plus /> Multiple answers
              </Button>
              <Button variant="outline" onClick={() => setQuestions((qs) => [...qs, newQuestion('true_false')])}>
                <Plus /> True / false
              </Button>
            </div>
          )}
        </div>
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Field label="Title" htmlFor="quiz-title" required>
                <Input id="quiz-title" value={meta.title} disabled={locked} onChange={(e) => setMeta({ ...meta, title: e.target.value })} />
              </Field>
              <Field label="Description" htmlFor="quiz-desc">
                <Textarea id="quiz-desc" rows={2} value={meta.description} disabled={locked} onChange={(e) => setMeta({ ...meta, description: e.target.value })} />
              </Field>
              <Field label="Time limit (minutes)" htmlFor="quiz-time">
                <Input
                  id="quiz-time"
                  type="number"
                  min={1}
                  max={300}
                  value={meta.timeLimitMinutes}
                  disabled={locked}
                  onChange={(e) => setMeta({ ...meta, timeLimitMinutes: Number(e.target.value) })}
                />
              </Field>
              <Field label="Opens" htmlFor="quiz-opens">
                <Input id="quiz-opens" type="datetime-local" value={meta.opensAt} disabled={locked} onChange={(e) => setMeta({ ...meta, opensAt: e.target.value })} />
              </Field>
              <Field label="Closes" htmlFor="quiz-closes">
                <Input id="quiz-closes" type="datetime-local" value={meta.closesAt} disabled={locked} onChange={(e) => setMeta({ ...meta, closesAt: e.target.value })} />
              </Field>
              <label className="flex items-center justify-between gap-3 text-sm">
                <span>Shuffle question order</span>
                <Switch checked={meta.shuffleQuestions} disabled={locked} onCheckedChange={(v) => setMeta({ ...meta, shuffleQuestions: v })} />
              </label>
              <div className="flex items-center justify-between rounded-xl bg-muted/60 p-3 text-sm">
                <span>{questions.length} questions</span>
                <Badge>{total} marks</Badge>
              </div>
              {error && (
                <p role="alert" className="text-sm font-medium text-danger">
                  {error}
                </p>
              )}
              <div className="grid gap-2">
                <Button onClick={() => void submit(true)} loading={save.isPending}>
                  <CheckCircle2 /> Save & publish
                </Button>
                <Button variant="outline" onClick={() => void submit(false)} disabled={save.isPending}>
                  <Save /> Save as draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
      <Preview questions={questions} open={preview} onOpenChange={setPreview} />
    </div>
  )
}
