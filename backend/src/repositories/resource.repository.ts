import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { escapeSearch, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface Resource {
  id: string
  courseId: string
  title: string
  description: string | null
  fileName: string
  filePath: string
  mimeType: string
  sizeBytes: number
  createdAt: string
  uploadedBy: { id: string; fullName: string } | null
}

const COLUMNS = 'id,course_id,title,description,file_name,file_path,mime_type,size_bytes,created_at,uploader:profiles(id,full_name)'

interface Row {
  id: string
  course_id: string
  title: string
  description: string | null
  file_name: string
  file_path: string
  mime_type: string
  size_bytes: number
  created_at: string
  uploader: { id: string; full_name: string } | null
}

function toResource(r: Row): Resource {
  return {
    id: r.id,
    courseId: r.course_id,
    title: r.title,
    description: r.description,
    fileName: r.file_name,
    filePath: r.file_path,
    mimeType: r.mime_type,
    sizeBytes: Number(r.size_bytes),
    createdAt: r.created_at,
    uploadedBy: r.uploader ? { id: r.uploader.id, fullName: r.uploader.full_name } : null,
  }
}

export async function listForCourse(db: SupabaseClient, courseId: string, search: string | undefined, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  let query = db
    .from('resources')
    .select(COLUMNS, { count: 'exact' })
    .eq('course_id', courseId)
    .order('created_at', { ascending: false })
    .range(from, to)
  const term = search ? escapeSearch(search) : ''
  if (term) query = query.ilike('title', `%${term}%`)
  const { rows, total } = unwrapCount(await query.returns<Row[]>())
  return { rows: rows.map(toResource), total }
}

export async function findById(id: string): Promise<Resource | null> {
  const row = unwrap(await adminDb.from('resources').select(COLUMNS).eq('id', id).maybeSingle<Row>())
  return row ? toResource(row) : null
}

export async function insert(input: {
  courseId: string
  uploadedBy: string
  title: string
  description: string | null
  filePath: string
  fileName: string
  mimeType: string
  sizeBytes: number
}): Promise<Resource> {
  const row = unwrap(
    await adminDb
      .from('resources')
      .insert({
        course_id: input.courseId,
        uploaded_by: input.uploadedBy,
        title: input.title,
        description: input.description,
        file_path: input.filePath,
        file_name: input.fileName,
        mime_type: input.mimeType,
        size_bytes: input.sizeBytes,
      })
      .select(COLUMNS)
      .single<Row>(),
  )
  return toResource(row)
}

export async function remove(id: string): Promise<void> {
  unwrap(await adminDb.from('resources').delete().eq('id', id))
}
