import { z } from 'zod'
import { formBoolean, isoDate, optionalText, pagination } from './common.schema.js'

const title = z.string().trim().min(3, 'Title must be at least 3 characters').max(200)
const instructions = z.string().trim().min(1, 'Instructions are required').max(10_000)
const maxMarks = z.coerce.number().positive('Max marks must be greater than 0').max(1000)

export const createAssignmentSchema = z.object({
  title,
  instructions,
  maxMarks,
  dueAt: isoDate,
  allowLate: formBoolean.default(false),
})

export const updateAssignmentSchema = z.object({
  title: title.optional(),
  instructions: instructions.optional(),
  maxMarks: maxMarks.optional(),
  dueAt: isoDate.optional(),
  allowLate: formBoolean.optional(),
  removeAttachment: formBoolean.optional(),
})

export const listAssignmentsQuery = pagination

export const submitSchema = z.object({
  textAnswer: optionalText(20_000),
  removeFile: formBoolean.default(false),
})

export const gradeSchema = z.object({
  marks: z.coerce.number({ invalid_type_error: 'Marks must be a number' }).min(0, 'Marks cannot be negative'),
  feedback: optionalText(5000),
})

export const submissionsQuery = pagination
