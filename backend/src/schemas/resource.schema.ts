import { z } from 'zod'
import { optionalText, pagination, searchTerm } from './common.schema.js'

export const createResourceSchema = z.object({
  title: z.string().trim().min(2, 'Title must be at least 2 characters').max(200),
  description: optionalText(2000),
})

export const listResourcesQuery = pagination.extend({ search: searchTerm })
