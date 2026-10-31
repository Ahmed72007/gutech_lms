import type { z } from 'zod'
import * as notificationRepository from '../repositories/notification.repository.js'
import type { pagination } from '../schemas/common.schema.js'
import type { RequestContext } from '../types/domain.js'
import { pageMeta } from '../utils/pagination.js'
import { now } from '../utils/time.js'

export async function list(ctx: RequestContext, query: z.infer<typeof pagination>) {
  const { rows, total } = await notificationRepository.list(ctx.db, ctx.user.id, query)
  return { data: rows, meta: pageMeta(query, total) }
}

export async function unreadCount(ctx: RequestContext) {
  return { count: await notificationRepository.unreadCount(ctx.db, ctx.user.id) }
}

export async function markRead(ctx: RequestContext, ids?: string[]) {
  await notificationRepository.markRead(ctx.db, ctx.user.id, ids, now())
}
