import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { escapeSearch, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export type ComplaintStatus = 'open' | 'in_review' | 'resolved' | 'rejected'
export type ComplaintCategory = 'academic' | 'technical' | 'facility' | 'conduct' | 'other'

export interface Complaint {
  id: string
  raisedBy: { id: string; fullName: string; email: string; role: string } | null
  raisedById: string
  course: { id: string; code: string; title: string } | null
  category: ComplaintCategory
  subject: string
  description: string
  attachmentPath: string | null
  attachmentName: string | null
  status: ComplaintStatus
  adminResponse: string | null
  resolvedBy: { id: string; fullName: string } | null
  createdAt: string
  updatedAt: string
}

const COLUMNS =
  'id,raised_by,category,subject,description,attachment_path,attachment_name,status,admin_response,created_at,updated_at,' +
  'raiser:profiles!complaints_raised_by_fkey(id,full_name,email,role),resolver:profiles!complaints_resolved_by_fkey(id,full_name),course:courses(id,code,title)'

interface Row {
  id: string
  raised_by: string
  category: ComplaintCategory
  subject: string
  description: string
  attachment_path: string | null
  attachment_name: string | null
  status: ComplaintStatus
  admin_response: string | null
  created_at: string
  updated_at: string
  raiser: { id: string; full_name: string; email: string; role: string } | null
  resolver: { id: string; full_name: string } | null
  course: { id: string; code: string; title: string } | null
}

function toComplaint(r: Row): Complaint {
  return {
    id: r.id,
    raisedById: r.raised_by,
    raisedBy: r.raiser ? { id: r.raiser.id, fullName: r.raiser.full_name, email: r.raiser.email, role: r.raiser.role } : null,
    course: r.course,
    category: r.category,
    subject: r.subject,
    description: r.description,
    attachmentPath: r.attachment_path,
    attachmentName: r.attachment_name,
    status: r.status,
    adminResponse: r.admin_response,
    resolvedBy: r.resolver ? { id: r.resolver.id, fullName: r.resolver.full_name } : null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

/** Inserted as the user so RLS enforces raised_by = auth.uid(). */
export async function insert(
  db: SupabaseClient,
  input: {
    raisedBy: string
    courseId: string | null
    category: ComplaintCategory
    subject: string
    description: string
    attachmentPath: string | null
    attachmentName: string | null
  },
): Promise<Complaint> {
  const row = unwrap(
    await db
      .from('complaints')
      .insert({
        raised_by: input.raisedBy,
        course_id: input.courseId,
        category: input.category,
        subject: input.subject,
        description: input.description,
        attachment_path: input.attachmentPath,
        attachment_name: input.attachmentName,
      })
      .select(COLUMNS)
      .single<Row>(),
  )
  return toComplaint(row)
}

export async function listMine(db: SupabaseClient, userId: string, status: ComplaintStatus | undefined, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  let query = db
    .from('complaints')
    .select(COLUMNS, { count: 'exact' })
    .eq('raised_by', userId)
    .order('created_at', { ascending: false })
    .range(from, to)
  if (status) query = query.eq('status', status)
  const { rows, total } = unwrapCount(await query.returns<Row[]>())
  return { rows: rows.map(toComplaint), total }
}

export async function listAll(filter: { status?: ComplaintStatus; category?: ComplaintCategory; search?: string }, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  let query = adminDb.from('complaints').select(COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).range(from, to)
  if (filter.status) query = query.eq('status', filter.status)
  if (filter.category) query = query.eq('category', filter.category)
  const term = filter.search ? escapeSearch(filter.search) : ''
  if (term) query = query.ilike('subject', `%${term}%`)
  const { rows, total } = unwrapCount(await query.returns<Row[]>())
  return { rows: rows.map(toComplaint), total }
}

export async function findById(id: string): Promise<Complaint | null> {
  const row = unwrap(await adminDb.from('complaints').select(COLUMNS).eq('id', id).maybeSingle<Row>())
  return row ? toComplaint(row) : null
}

export async function updateStatus(
  id: string,
  input: { status: ComplaintStatus; adminResponse: string | null; resolvedBy: string | null },
): Promise<Complaint> {
  const row = unwrap(
    await adminDb
      .from('complaints')
      .update({ status: input.status, admin_response: input.adminResponse, resolved_by: input.resolvedBy })
      .eq('id', id)
      .select(COLUMNS)
      .single<Row>(),
  )
  return toComplaint(row)
}

export async function countOpen(): Promise<number> {
  const { count, error } = await adminDb.from('complaints').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_review'])
  if (error) throw error
  return count ?? 0
}
