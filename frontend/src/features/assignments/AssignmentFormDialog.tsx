import { zodResolver } from '@hookform/resolvers/zod'
import { Paperclip } from 'lucide-react'
import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { DOCUMENT_ACCEPT, DOCUMENT_HINT, FileDrop, MAX_DOCUMENT_BYTES } from '@/components/ui/file-drop'
import { Field, fieldAria, Input, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/primitives'
import { ApiError, errorMessage } from '@/lib/api'
import type { Assignment } from '@/lib/types'
import { fromLocalInput, toLocalInput } from '@/lib/utils'
import { useSaveAssignment } from './api'

const schema = z.object({
  title: z.string().trim().min(3, 'At least 3 characters').max(200),
  instructions: z.string().trim().min(1, 'Instructions are required').max(10_000),
  maxMarks: z.coerce.number({ invalid_type_error: 'Enter a number' }).positive('Must be greater than 0').max(1000),
  dueAt: z.string().min(1, 'Pick a due date'),
  allowLate: z.boolean(),
})
type Values = z.infer<typeof schema>

export function AssignmentFormDialog({
  courseId,
  assignment,
  open,
  onOpenChange,
}: {
  courseId: string
  assignment?: Assignment
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const navigate = useNavigate()
  const save = useSaveAssignment(courseId, assignment?.id)
  const [file, setFile] = useState<File | null>(null)
  const [removeAttachment, setRemoveAttachment] = useState(false)
  const [progress, setProgress] = useState<number | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)

  const defaultDue = new Date(Date.now() + 7 * 864e5)
  defaultDue.setHours(23, 59, 0, 0)
  const {
    register,
    control,
    handleSubmit,
    setError,
    reset,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      title: assignment?.title ?? '',
      instructions: assignment?.instructions ?? '',
      maxMarks: assignment?.maxMarks ?? 10,
      dueAt: toLocalInput(assignment?.dueAt ?? defaultDue),
      allowLate: assignment?.allowLate ?? false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    const form = new FormData()
    form.append('title', values.title)
    form.append('instructions', values.instructions)
    form.append('maxMarks', String(values.maxMarks))
    form.append('dueAt', fromLocalInput(values.dueAt))
    form.append('allowLate', String(values.allowLate))
    if (file) form.append('attachment', file)
    else if (removeAttachment) form.append('removeAttachment', 'true')
    setServerError(null)
    if (file) setProgress(0)
    try {
      const saved = await save.mutateAsync({ form, onProgress: setProgress })
      onOpenChange(false)
      setFile(null)
      setProgress(null)
      reset()
      if (!assignment) navigate(`/assignments/${saved.id}`)
    } catch (error) {
      setProgress(null)
      if (error instanceof ApiError && error.details?.length) {
        for (const d of error.details) setError(d.path as keyof Values, { message: d.message })
      }
      setServerError(errorMessage(error))
    }
  })

  return (
    <Dialog open={open} onOpenChange={(o) => !save.isPending && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{assignment ? 'Edit assignment' : 'New assignment'}</DialogTitle>
          <DialogDescription>Students see the instructions, due date and any attachment.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="space-y-4">
          <Field label="Title" htmlFor="a-title" error={errors.title?.message} required>
            <Input {...fieldAria('a-title', errors.title?.message)} {...register('title')} />
          </Field>
          <Field label="Instructions" htmlFor="a-instructions" error={errors.instructions?.message} required>
            <Textarea rows={6} {...fieldAria('a-instructions', errors.instructions?.message)} {...register('instructions')} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Due date" htmlFor="a-due" error={errors.dueAt?.message} required>
              <Input type="datetime-local" {...fieldAria('a-due', errors.dueAt?.message)} {...register('dueAt')} />
            </Field>
            <Field label="Max marks" htmlFor="a-max" error={errors.maxMarks?.message} required>
              <Input type="number" min={1} step="0.5" inputMode="decimal" {...fieldAria('a-max', errors.maxMarks?.message)} {...register('maxMarks')} />
            </Field>
          </div>
          <Controller
            control={control}
            name="allowLate"
            render={({ field }) => (
              <label className="flex items-center justify-between gap-4 rounded-xl border p-3.5">
                <span>
                  <span className="block text-sm font-medium">Accept late submissions</span>
                  <span className="block text-xs text-muted-foreground">Late work is accepted and flagged instead of blocked.</span>
                </span>
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Accept late submissions" />
              </label>
            )}
          />
          <div>
            <p className="mb-1.5 text-sm font-medium">Attachment (optional)</p>
            {assignment?.hasAttachment && !file && !removeAttachment ? (
              <div className="flex items-center gap-3 rounded-xl border bg-muted/40 p-3 text-sm">
                <Paperclip className="size-4 text-primary" />
                <span className="flex-1 truncate">{assignment.attachmentName}</span>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRemoveAttachment(true)}>
                  Replace or remove
                </Button>
              </div>
            ) : (
              <FileDrop file={file} onFile={setFile} accept={DOCUMENT_ACCEPT} maxBytes={MAX_DOCUMENT_BYTES} hint={DOCUMENT_HINT} progress={progress} disabled={save.isPending} />
            )}
          </div>
          {serverError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {serverError}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>
              Cancel
            </Button>
            <Button type="submit" loading={save.isPending}>
              {assignment ? 'Save changes' : 'Create assignment'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
