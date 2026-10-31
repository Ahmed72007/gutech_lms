import { z } from 'zod'
import { email, passwordPolicy } from './common.schema.js'

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Password is required').max(128),
})

export const forgotPasswordSchema = z.object({ email })

export const resetPasswordSchema = z.object({ newPassword: passwordPolicy })

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required').max(128),
    newPassword: passwordPolicy,
  })
  .refine((value) => value.currentPassword !== value.newPassword, {
    message: 'New password must be different from the current password',
    path: ['newPassword'],
  })
