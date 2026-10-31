import { z } from 'zod'
import { formBoolean, optionalText, pagination, searchTerm, uuid } from './common.schema.js'

const code = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,6}\d{2,4}[A-Z]?$/, 'Use a code like CS101')

const title = z.string().trim().min(3, 'Title must be at least 3 characters').max(150)

export const createCourseSchema = z.object({
  code,
  title,
  description: optionalText(2000),
})

export const updateCourseSchema = z
  .object({
    code: code.optional(),
    title: title.optional(),
    description: optionalText(2000),
    isArchived: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' })

export const listCoursesQuery = pagination.extend({
  search: searchTerm,
  archived: z.enum(['true', 'false', 'all']).default('false'),
})

export const setTeachersSchema = z.object({
  teacherIds: z.array(uuid).max(20).transform((ids) => [...new Set(ids)]),
})

export const enrollSchema = z.object({
  studentIds: z.array(uuid).min(1, 'Select at least one student').max(500),
})

export const enrollQuery = z.object({
  dryRun: formBoolean.default(false),
})

export const enrollmentParams = z.object({ id: uuid, studentId: uuid })

export const rosterQuery = pagination.extend({ search: searchTerm })
