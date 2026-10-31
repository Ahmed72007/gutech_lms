import type { z } from 'zod'
import * as auditRepository from '../repositories/audit.repository.js'
import type { auditQuery } from '../schemas/marks.schema.js'
import { pageMeta } from '../utils/pagination.js'

export async function list(query: z.infer<typeof auditQuery>) {
  const { rows, total } = await auditRepository.list({ entity: query.entity }, query)
  return { data: rows, meta: pageMeta(query, total) }
}
