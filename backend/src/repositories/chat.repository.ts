import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { unwrap } from '../utils/db.js'

export interface ChatMessage {
  id: string
  courseId: string
  senderId: string
  body: string
  createdAt: string
  deletedAt: string | null
  sender: { id: string; fullName: string; role: string } | null
}

/** Stored in place of the original text so deleted content never reaches clients. */
export const DELETED_BODY = '[deleted]'

const COLUMNS = 'id,course_id,sender_id,body,created_at,deleted_at,sender:profiles(id,full_name,role)'

interface Row {
  id: string
  course_id: string
  sender_id: string
  body: string
  created_at: string
  deleted_at: string | null
  sender: { id: string; full_name: string; role: string } | null
}

function toMessage(r: Row): ChatMessage {
  return {
    id: r.id,
    courseId: r.course_id,
    senderId: r.sender_id,
    body: r.body,
    createdAt: r.created_at,
    deletedAt: r.deleted_at,
    sender: r.sender ? { id: r.sender.id, fullName: r.sender.full_name, role: r.sender.role } : null,
  }
}

/** Newest first, `limit + 1` rows so the caller can tell whether more history exists. */
export async function history(db: SupabaseClient, courseId: string, before: Date | undefined, limit: number): Promise<ChatMessage[]> {
  let query = db
    .from('chat_messages')
    .select(COLUMNS)
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .limit(limit + 1)
  if (before) query = query.lt('created_at', before.toISOString())
  return unwrap(await query.returns<Row[]>()).map(toMessage)
}

/** Inserted as the user so the RLS membership check applies too. */
export async function insert(db: SupabaseClient, courseId: string, senderId: string, body: string): Promise<ChatMessage> {
  const row = unwrap(await db.from('chat_messages').insert({ course_id: courseId, sender_id: senderId, body }).select(COLUMNS).single<Row>())
  return toMessage(row)
}

export async function findById(id: string): Promise<ChatMessage | null> {
  const row = unwrap(await adminDb.from('chat_messages').select(COLUMNS).eq('id', id).maybeSingle<Row>())
  return row ? toMessage(row) : null
}

export async function softDelete(id: string, at: Date): Promise<void> {
  unwrap(await adminDb.from('chat_messages').update({ deleted_at: at.toISOString(), body: DELETED_BODY }).eq('id', id))
}
