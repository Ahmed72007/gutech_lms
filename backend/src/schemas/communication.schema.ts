import { z } from 'zod'
import { isoDate, optionalText, pagination, searchTerm, uuid } from './common.schema.js'

// Announcements ------------------------------------------------------------
export const createAnnouncementSchema = z.object({
  courseId: uuid.nullable().optional(),
  title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
  body: z.string().trim().min(1, 'Message is required').max(5000),
  isPinned: z.boolean().default(false),
})

export const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().min(3).max(200).optional(),
    body: z.string().trim().min(1).max(5000).optional(),
    isPinned: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), { message: 'Provide at least one field to update' })

export const listAnnouncementsQuery = pagination.extend({
  courseId: uuid.optional(),
  scope: z.enum(['all', 'global']).default('all'),
})

export const markReadSchema = z.object({ before: isoDate.optional() })

// Chat ---------------------------------------------------------------------
export const listMessagesQuery = z.object({
  before: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
})

export const sendMessageSchema = z.object({
  body: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message is too long (2000 characters max)'),
})

// Complaints ---------------------------------------------------------------
export const complaintCategory = z.enum(['academic', 'technical', 'facility', 'conduct', 'other'])
export const complaintStatus = z.enum(['open', 'in_review', 'resolved', 'rejected'])

export const createComplaintSchema = z.object({
  category: complaintCategory,
  subject: z.string().trim().min(3, 'Subject must be at least 3 characters').max(200),
  description: z.string().trim().min(10, 'Please describe the issue (10 characters minimum)').max(5000),
  courseId: z.preprocess((v) => (v === '' ? undefined : v), uuid.optional()),
})

export const myComplaintsQuery = pagination.extend({ status: complaintStatus.optional() })

export const adminComplaintsQuery = pagination.extend({
  status: complaintStatus.optional(),
  category: complaintCategory.optional(),
  search: searchTerm,
})

export const updateComplaintSchema = z.object({
  status: complaintStatus,
  adminResponse: optionalText(5000),
})

// Notifications ------------------------------------------------------------
export const markNotificationsSchema = z.object({ ids: z.array(uuid).max(100).optional() })
