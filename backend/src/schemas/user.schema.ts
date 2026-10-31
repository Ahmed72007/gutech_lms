import { z } from 'zod'
import { email, optionalText, pagination, passwordPolicy, searchTerm } from './common.schema.js'

const role = z.enum(['admin', 'teacher', 'student'])
const fullName = z.string().trim().min(2, 'Name must be at least 2 characters').max(120)
const rollNo = z.string().trim().min(1).max(40)

export const createUserSchema = z
  .object({
    fullName,
    email,
    role,
    tempPassword: passwordPolicy,
    rollNo: rollNo.optional(),
  })
  .refine((v) => v.role === 'student' || !v.rollNo, { message: 'Roll number is only for students', path: ['rollNo'] })

export const listUsersQuery = pagination.extend({
  search: searchTerm,
  role: role.optional(),
  status: z.enum(['active', 'inactive']).optional(),
})

export const updateUserSchema = z
  .object({
    fullName: fullName.optional(),
    role: role.optional(),
    isActive: z.boolean().optional(),
    rollNo: rollNo.nullable().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' })

export const adminResetPasswordSchema = z
  .object({
    mode: z.enum(['email', 'temp']).default('email'),
    tempPassword: passwordPolicy.optional(),
  })
  .refine((v) => v.mode === 'email' || Boolean(v.tempPassword), {
    message: 'A temporary password is required',
    path: ['tempPassword'],
  })

export const updateOwnProfileSchema = z
  .object({
    fullName: fullName.optional(),
    phone: optionalText(32).refine((v) => v == null || /^[+\d][\d\s()-]{5,31}$/.test(v), 'Enter a valid phone number'),
    bio: optionalText(500),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' })
