import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface Announcement {
  id: string
  courseId: string | null
  title: string
  body: string
  isPinned: boolean
  createdAt: string
  updatedAt: string
  author: { id: string; fullName: string; role: string } | null
  course: { id: string; code: string; title: string } | null
  isRead: boolean
}

const COLUMNS =
  'id,course_id,author_id,title,body,is_pinned,created_at,updated_at,author:profiles!announcements_author_id_fkey(id,full_name,role),course:courses(id,code,title)'

interface Row {
  id: string
  course_id: string | null
  author_id: string
  title: string
  body: string
  is_pinned: boolean
  created_at: string
  updated_at: string
  author: { id: string; full_name: string; role: string } | null
  course: { id: string; code: string; title: string } | null
  announcement_reads?: Array<{ user_id: string }>
}

function toAnnouncement(r: Row, viewerId?: string): Announcement {
  return {
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    body: r.body,
    isPinned: r.is_pinned,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    author: r.author ? { id: r.author.id, fullName: r.author.full_name, role: r.author.role } : null,
    course: r.course,
    isRead: r.author_id === viewerId || (r.announcement_reads ?? []).length > 0,
  }
}

/** Feed as the user: RLS limits it to global + own-course announcements. Pinned first. */
export async function feed(
  db: SupabaseClient,
  viewerId: string,
  filter: { courseId?: string; globalOnly?: boolean },
  pagination: Pagination,
) {
  const [from, to] = toRange(pagination)
  let query = db
    .from('announcements')
    .select(`${COLUMNS},announcement_reads(user_id)`, { count: 'exact' })
    .eq('announcement_reads.user_id', viewerId)
    .order('is_pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (filter.courseId) query = query.eq('course_id', filter.courseId)
  if (filter.globalOnly) query = query.is('course_id', null)
  const { rows, total } = unwrapCount(await query.returns<Row[]>())
  return { rows: rows.map((r) => toAnnouncement(r, viewerId)), total }
}

export async function findById(id: string): Promise<(Announcement & { authorId: string }) | null> {
  const row = unwrap(await adminDb.from('announcements').select(COLUMNS).eq('id', id).maybeSingle<Row>())
  return row ? { ...toAnnouncement(row), authorId: row.author_id } : null
}

export async function insert(input: { courseId: string | null; authorId: string; title: string; body: string; isPinned: boolean }) {
  const row = unwrap(
    await adminDb
      .from('announcements')
      .insert({ course_id: input.courseId, author_id: input.authorId, title: input.title, body: input.body, is_pinned: input.isPinned })
      .select(COLUMNS)
      .single<Row>(),
  )
  return toAnnouncement(row, input.authorId)
}

export async function update(id: string, patch: { title?: string; body?: string; isPinned?: boolean }) {
  const values: Record<string, unknown> = {}
  if (patch.title !== undefined) values.title = patch.title
  if (patch.body !== undefined) values.body = patch.body
  if (patch.isPinned !== undefined) values.is_pinned = patch.isPinned
  const row = unwrap(await adminDb.from('announcements').update(values).eq('id', id).select(COLUMNS).single<Row>())
  return toAnnouncement(row)
}

export async function remove(id: string): Promise<void> {
  unwrap(await adminDb.from('announcements').delete().eq('id', id))
}

export async function markRead(db: SupabaseClient, before: Date): Promise<number> {
  return unwrap(await db.rpc('mark_announcements_read', { p_before: before.toISOString() })) as number
}

export async function unreadCount(db: SupabaseClient): Promise<number> {
  return (unwrap(await db.rpc('unread_announcement_count')) as number) ?? 0
}
