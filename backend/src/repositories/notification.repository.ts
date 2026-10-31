import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { logger } from '../config/logger.js'
import { unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface Notification {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

interface Row {
  id: string
  kind: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

const toNotification = (r: Row): Notification => ({
  id: r.id,
  kind: r.kind,
  title: r.title,
  body: r.body,
  link: r.link,
  readAt: r.read_at,
  createdAt: r.created_at,
})

/** In-app notice. Best effort: a failed notice never fails the triggering action. */
export async function create(userId: string, notice: { kind: string; title: string; body?: string; link?: string }): Promise<void> {
  const { error } = await adminDb
    .from('notifications')
    .insert({ user_id: userId, kind: notice.kind, title: notice.title, body: notice.body ?? null, link: notice.link ?? null })
  if (error) logger.error({ err: error }, 'Failed to create notification')
}

export async function list(db: SupabaseClient, userId: string, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  const { rows, total } = unwrapCount(
    await db
      .from('notifications')
      .select('id,kind,title,body,link,read_at,created_at', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to)
      .returns<Row[]>(),
  )
  return { rows: rows.map(toNotification), total }
}

export async function unreadCount(db: SupabaseClient, userId: string): Promise<number> {
  const { count, error } = await db
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .is('read_at', null)
  if (error) throw error
  return count ?? 0
}

export async function markRead(db: SupabaseClient, userId: string, ids: string[] | undefined, at: Date): Promise<void> {
  let query = db.from('notifications').update({ read_at: at.toISOString() }).eq('user_id', userId).is('read_at', null)
  if (ids) query = query.in('id', ids)
  unwrap(await query)
}
