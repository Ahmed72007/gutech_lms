import type { z } from 'zod'
import * as announcementRepository from '../repositories/announcement.repository.js'
import * as auditRepository from '../repositories/audit.repository.js'
import type { createAnnouncementSchema, listAnnouncementsQuery, updateAnnouncementSchema } from '../schemas/communication.schema.js'
import type { RequestContext } from '../types/domain.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { now } from '../utils/time.js'
import { assertCanManage, assertCanView } from './access.service.js'

export async function create(ctx: RequestContext, input: z.infer<typeof createAnnouncementSchema>) {
  const courseId = input.courseId ?? null
  if (courseId === null) {
    if (ctx.user.role !== 'admin') throw errors.forbidden('Only admins can post global announcements.')
  } else {
    await assertCanManage(ctx.user, courseId)
  }
  return announcementRepository.insert({
    courseId,
    authorId: ctx.user.id,
    title: input.title,
    body: input.body,
    isPinned: input.isPinned,
  })
}

export async function list(ctx: RequestContext, query: z.infer<typeof listAnnouncementsQuery>) {
  if (query.courseId) await assertCanView(ctx.user, query.courseId)
  const { rows, total } = await announcementRepository.feed(
    ctx.db,
    ctx.user.id,
    { courseId: query.courseId, globalOnly: query.scope === 'global' },
    query,
  )
  return { data: rows, meta: pageMeta(query, total) }
}

async function loadOwned(ctx: RequestContext, id: string) {
  const announcement = await announcementRepository.findById(id)
  if (!announcement) throw errors.notFound('Announcement not found.')
  if (ctx.user.role !== 'admin' && announcement.authorId !== ctx.user.id) {
    throw errors.forbidden('Only the author or an admin can change this announcement.')
  }
  return announcement
}

export async function update(ctx: RequestContext, id: string, input: z.infer<typeof updateAnnouncementSchema>) {
  await loadOwned(ctx, id)
  return announcementRepository.update(id, input)
}

export async function remove(ctx: RequestContext, id: string) {
  await loadOwned(ctx, id)
  await announcementRepository.remove(id)
  await auditRepository.record(ctx.user.id, 'announcement.delete', 'announcement', id)
}

export async function markRead(ctx: RequestContext, before?: Date) {
  const marked = await announcementRepository.markRead(ctx.db, before ?? now())
  return { marked }
}

export async function unreadCount(ctx: RequestContext) {
  return { count: await announcementRepository.unreadCount(ctx.db) }
}
