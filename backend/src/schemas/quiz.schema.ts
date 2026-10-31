import { z } from 'zod'
import { isoDate, optionalText, pagination, uuid } from './common.schema.js'

const option = z.object({
  id: z.string().trim().min(1).max(16),
  text: z.string().trim().min(1, 'Option text is required').max(500),
})

export const questionSchema = z
  .object({
    type: z.enum(['mcq_single', 'mcq_multi', 'true_false']),
    prompt: z.string().trim().min(1, 'Question text is required').max(2000),
    options: z.array(option).min(2, 'Add at least two options').max(8, 'At most eight options'),
    correctOptionIds: z.array(z.string()).min(1, 'Mark at least one correct option'),
    marks: z.coerce.number().positive().max(100).default(1),
  })
  .superRefine((q, ctx) => {
    const ids = q.options.map((o) => o.id)
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'Option ids must be unique' })
    }
    if (q.correctOptionIds.some((id) => !ids.includes(id))) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIds'], message: 'Correct answers must be one of the options' })
    }
    if (q.type !== 'mcq_multi' && q.correctOptionIds.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['correctOptionIds'], message: 'Exactly one correct option is required' })
    }
    if (q.type === 'true_false' && q.options.length !== 2) {
      ctx.addIssue({ code: 'custom', path: ['options'], message: 'True/false questions have exactly two options' })
    }
  })

export type QuestionInput = z.infer<typeof questionSchema>

const quizFields = {
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  description: optionalText(2000),
  timeLimitMinutes: z.coerce.number().int().min(1).max(300),
  opensAt: isoDate,
  closesAt: isoDate,
  isPublished: z.boolean().default(false),
  shuffleQuestions: z.boolean().default(false),
  questions: z.array(questionSchema).min(1, 'Add at least one question').max(100),
}

export const createQuizSchema = z
  .object(quizFields)
  .refine((q) => q.closesAt > q.opensAt, { message: 'Closing time must be after opening time', path: ['closesAt'] })

export const updateQuizSchema = z
  .object({
    title: quizFields.title.optional(),
    description: quizFields.description,
    timeLimitMinutes: quizFields.timeLimitMinutes.optional(),
    opensAt: isoDate.optional(),
    closesAt: isoDate.optional(),
    isPublished: z.boolean().optional(),
    shuffleQuestions: z.boolean().optional(),
    questions: quizFields.questions.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' })

export const submitAttemptSchema = z.object({
  answers: z.record(uuid, z.array(z.string().max(16)).max(8)).default({}),
})

export const quizListQuery = pagination
export const resultsQuery = pagination
