import type { z } from 'zod'
import * as auditRepository from '../repositories/audit.repository.js'
import * as complaintRepository from '../repositories/complaint.repository.js'
import type { Complaint, ComplaintStatus } from '../repositories/complaint.repository.js'
import * as notificationRepository from '../repositories/notification.repository.js'
import * as storage from '../repositories/storage.repository.js'
import type {
  adminComplaintsQuery,
  createComplaintSchema,
  myComplaintsQuery,
  updateComplaintSchema,
} from '../schemas/communication.schema.js'
import type { RequestContext, UploadedFile } from '../types/domain.js'
import { FILE_POLICIES, inspectFile, sanitizeFileName, storagePath } from '../utils/files.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { getCourseAccess } from './access.service.js'

/** open → in_review → resolved | rejected */
const TRANSITIONS: Record<ComplaintStatus, ComplaintStatus[]> = {
  open: ['in_review'],
  in_review: ['resolved', 'rejected'],
  resolved: [],
  rejected: [],
}

const STATUS_LABEL: Record<ComplaintStatus, string> = {
  open: 'Open',
  in_review: 'In review',
  resolved: 'Resolved',
  rejected: 'Rejected',
}

function present(c: Complaint) {
  const { attachmentPath, raisedById: _raisedById, ...rest } = c
  return { ...rest, hasAttachment: Boolean(attachmentPath) }
}

export async function create(ctx: RequestContext, input: z.infer<typeof createComplaintSchema>, file: UploadedFile | null) {
  if (ctx.user.role === 'admin') throw errors.forbidden('Admins resolve complaints rather than file them.')
  if (input.courseId) {
    const access = await getCourseAccess(ctx.user, input.courseId)
    if (!access.isTeacher && !access.isStudent) throw errors.unprocessable('You can only link a course you belong to.')
  }

  let attachment: { path: string; name: string } | null = null
  if (file) {
    const { mime } = await inspectFile(file, FILE_POLICIES.complaint)
    const name = sanitizeFileName(file.originalName)
    attachment = { path: storagePath(ctx.user.id, name), name }
    await storage.upload(storage.BUCKETS.complaints, attachment.path, file.buffer, mime)
  }

  try {
    const complaint = await complaintRepository.insert(ctx.db, {
      raisedBy: ctx.user.id,
      courseId: input.courseId ?? null,
      category: input.category,
      subject: input.subject,
      description: input.description,
      attachmentPath: attachment?.path ?? null,
      attachmentName: attachment?.name ?? null,
    })
    return present(complaint)
  } catch (error) {
    if (attachment) await storage.remove(storage.BUCKETS.complaints, [attachment.path])
    throw error
  }
}

export async function listMine(ctx: RequestContext, query: z.infer<typeof myComplaintsQuery>) {
  if (ctx.user.role === 'admin') throw errors.forbidden('Use the complaints queue instead.')
  const { rows, total } = await complaintRepository.listMine(ctx.db, ctx.user.id, query.status, query)
  return { data: rows.map(present), meta: pageMeta(query, total) }
}

export async function listAll(query: z.infer<typeof adminComplaintsQuery>) {
  const { rows, total } = await complaintRepository.listAll({ status: query.status, category: query.category, search: query.search }, query)
  return { data: rows.map(present), meta: pageMeta(query, total) }
}

/** Owners and admins only. Everyone else gets 404 so existence is not revealed. */
async function loadVisible(ctx: RequestContext, id: string): Promise<Complaint> {
  const complaint = await complaintRepository.findById(id)
  if (!complaint || (ctx.user.role !== 'admin' && complaint.raisedById !== ctx.user.id)) {
    throw errors.notFound('Complaint not found.')
  }
  return complaint
}

export async function get(ctx: RequestContext, id: string) {
  return present(await loadVisible(ctx, id))
}

export async function attachmentUrl(ctx: RequestContext, id: string) {
  const complaint = await loadVisible(ctx, id)
  if (!complaint.attachmentPath) throw errors.notFound('This complaint has no attachment.')
  const url = await storage.signedUrl(storage.BUCKETS.complaints, complaint.attachmentPath, {
    downloadName: complaint.attachmentName ?? undefined,
  })
  return { url, fileName: complaint.attachmentName, expiresIn: storage.SIGNED_URL_TTL_SECONDS }
}

export async function updateStatus(ctx: RequestContext, id: string, input: z.infer<typeof updateComplaintSchema>) {
  const complaint = await complaintRepository.findById(id)
  if (!complaint) throw errors.notFound('Complaint not found.')

  if (input.status !== complaint.status && !TRANSITIONS[complaint.status].includes(input.status)) {
    throw errors.conflict(
      `A complaint cannot move from "${STATUS_LABEL[complaint.status]}" to "${STATUS_LABEL[input.status]}".`,
      'INVALID_TRANSITION',
    )
  }
  const closing = input.status === 'resolved' || input.status === 'rejected'
  const response = input.adminResponse ?? complaint.adminResponse
  if (closing && !response) {
    throw errors.unprocessable('A response is required when resolving or rejecting a complaint.', [
      { path: 'adminResponse', message: 'Response is required' },
    ])
  }

  const updated = await complaintRepository.updateStatus(id, {
    status: input.status,
    adminResponse: response ?? null,
    resolvedBy: closing ? ctx.user.id : null,
  })

  if (input.status !== complaint.status) {
    await notificationRepository.create(complaint.raisedById, {
      kind: 'complaint_status',
      title: `Complaint ${STATUS_LABEL[input.status].toLowerCase()}: ${complaint.subject}`,
      body: response ?? undefined,
      link: `/complaints?open=${complaint.id}`,
    })
  }
  await auditRepository.record(ctx.user.id, `complaint.${input.status}`, 'complaint', id)
  return present(updated)
}
