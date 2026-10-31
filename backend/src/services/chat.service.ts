import type { z } from 'zod'
import * as accessRepository from '../repositories/access.repository.js'
import * as auditRepository from '../repositories/audit.repository.js'
import * as chatRepository from '../repositories/chat.repository.js'
import type { ChatMessage } from '../repositories/chat.repository.js'
import type { listMessagesQuery } from '../schemas/communication.schema.js'
import type { RequestContext } from '../types/domain.js'
import { errors } from '../utils/http.js'
import { now } from '../utils/time.js'
import { assertCanView, assertIsMember } from './access.service.js'

/** Senders may delete their own message within this window. */
export const SENDER_DELETE_WINDOW_MS = 5 * 60 * 1000

export function presentMessage(m: ChatMessage) {
  return {
    id: m.id,
    courseId: m.courseId,
    senderId: m.senderId,
    body: m.deletedAt ? null : m.body,
    createdAt: m.createdAt,
    deletedAt: m.deletedAt,
    sender: m.sender,
  }
}

export async function history(ctx: RequestContext, courseId: string, query: z.infer<typeof listMessagesQuery>) {
  await assertCanView(ctx.user, courseId)
  const rows = await chatRepository.history(ctx.db, courseId, query.before, query.limit)
  const hasMore = rows.length > query.limit
  const page = rows.slice(0, query.limit)
  return {
    data: page.map(presentMessage),
    meta: { limit: query.limit, hasMore, nextBefore: hasMore ? (page[page.length - 1]?.createdAt ?? null) : null },
  }
}

export async function send(ctx: RequestContext, courseId: string, body: string) {
  await assertIsMember(ctx.user, courseId)
  const message = await chatRepository.insert(ctx.db, courseId, ctx.user.id, body)
  return presentMessage(message)
}

export async function remove(ctx: RequestContext, messageId: string) {
  const message = await chatRepository.findById(messageId)
  if (!message) throw errors.notFound('Message not found.')
  if (message.deletedAt) return

  const isSender = message.senderId === ctx.user.id
  const withinWindow = now().getTime() - new Date(message.createdAt).getTime() <= SENDER_DELETE_WINDOW_MS
  const isModerator = ctx.user.role === 'admin' || (ctx.user.role === 'teacher' && (await accessRepository.isTeacher(message.courseId, ctx.user.id)))

  if (!isModerator && !(isSender && withinWindow)) {
    throw errors.forbidden(isSender ? 'Messages can only be deleted within 5 minutes of sending.' : 'You cannot delete this message.')
  }
  await chatRepository.softDelete(message.id, now())
  if (!isSender) await auditRepository.record(ctx.user.id, 'chat_message.delete', 'chat_message', message.id)
}
