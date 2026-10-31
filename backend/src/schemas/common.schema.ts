import { z } from 'zod'

export const uuid = z.string().uuid('Must be a valid id')

export const idParams = z.object({ id: uuid })
export const courseIdParams = z.object({ id: uuid })

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
})

export const searchTerm = z.string().trim().max(100).optional()

export const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(254)

/** At least 10 characters, one letter and one number. */
export const passwordPolicy = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Za-z]/, 'Password must include a letter')
  .regex(/\d/, 'Password must include a number')

export const isoDate = z.coerce.date({ invalid_type_error: 'Must be a valid date' })

/** Multipart fields arrive as strings; JSON sends real booleans. Accept both. */
export const formBoolean = z.preprocess((value) => {
  if (value === 'true' || value === '1' || value === 'on') return true
  if (value === 'false' || value === '0' || value === '') return false
  return value
}, z.boolean())

/** Empty strings from forms become null. */
export const optionalText = (max: number) =>
  z.preprocess((value) => (typeof value === 'string' && value.trim() === '' ? null : value), z.string().trim().max(max).nullable().optional())
