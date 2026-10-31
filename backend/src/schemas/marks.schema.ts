import { z } from 'zod'
import { pagination, uuid } from './common.schema.js'

export const myMarksQuery = z.object({
  courseId: uuid.optional(),
  studentId: uuid.optional(),
})

export const gradebookQuery = pagination.extend({
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
})

export const auditQuery = pagination.extend({ entity: z.string().trim().max(50).optional() })
