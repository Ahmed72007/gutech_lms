import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import { escapeSearch, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export interface PersonRef {
  id: string
  fullName: string
  email: string
}

export interface Course {
  id: string
  code: string
  title: string
  description: string | null
  isArchived: boolean
  createdAt: string
  updatedAt: string
  teachers: PersonRef[]
  studentCount: number
}

const COURSE_COLUMNS = 'id,code,title,description,is_archived,created_at,updated_at'
const WITH_TEACHERS = `${COURSE_COLUMNS},course_teachers(teacher:profiles(id,full_name,email))`

interface CourseRow {
  id: string
  code: string
  title: string
  description: string | null
  is_archived: boolean
  created_at: string
  updated_at: string
  course_teachers?: Array<{ teacher: { id: string; full_name: string; email: string } | null }>
}

function toCourse(row: CourseRow, studentCount = 0): Course {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teachers: (row.course_teachers ?? [])
      .map((ct) => ct.teacher)
      .filter((t): t is NonNullable<typeof t> => t !== null)
      .map((t) => ({ id: t.id, fullName: t.full_name, email: t.email })),
    studentCount,
  }
}

/** Number of enrolled students per course, in one query (no N+1). */
async function studentCounts(courseIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>()
  if (courseIds.length === 0) return counts
  const rows = unwrap(await adminDb.from('enrollments').select('course_id').in('course_id', courseIds)) as Array<{ course_id: string }>
  for (const r of rows) counts.set(r.course_id, (counts.get(r.course_id) ?? 0) + 1)
  return counts
}

export async function list(
  filter: { search?: string; archived: 'true' | 'false' | 'all' },
  pagination: Pagination,
): Promise<{ rows: Course[]; total: number }> {
  const [from, to] = toRange(pagination)
  let query = adminDb.from('courses').select(WITH_TEACHERS, { count: 'exact' }).order('code').range(from, to)
  if (filter.archived !== 'all') query = query.eq('is_archived', filter.archived === 'true')
  const term = filter.search ? escapeSearch(filter.search) : ''
  if (term) query = query.or(`code.ilike.%${term}%,title.ilike.%${term}%`)
  const { rows, total } = unwrapCount(await query.returns<CourseRow[]>())
  const counts = await studentCounts(rows.map((r) => r.id))
  return { rows: rows.map((r) => toCourse(r, counts.get(r.id))), total }
}

export async function findById(id: string): Promise<Course | null> {
  const row = unwrap(await adminDb.from('courses').select(WITH_TEACHERS).eq('id', id).maybeSingle<CourseRow>())
  if (!row) return null
  const counts = await studentCounts([id])
  return toCourse(row, counts.get(id))
}

/** Runs as the user so RLS also restricts the result to their own courses. */
export async function listByIds(db: SupabaseClient, ids: string[]): Promise<Course[]> {
  if (ids.length === 0) return []
  const rows = unwrap(await db.from('courses').select(WITH_TEACHERS).in('id', ids).order('code').returns<CourseRow[]>())
  const counts = await studentCounts(ids)
  return rows.map((r) => toCourse(r, counts.get(r.id)))
}

export async function insert(input: { code: string; title: string; description?: string | null }): Promise<Course> {
  const row = unwrap(
    await adminDb
      .from('courses')
      .insert({ code: input.code, title: input.title, description: input.description ?? null })
      .select(WITH_TEACHERS)
      .single<CourseRow>(),
  )
  return toCourse(row)
}

export async function update(
  id: string,
  patch: { code?: string; title?: string; description?: string | null; isArchived?: boolean },
): Promise<Course | null> {
  const values: Record<string, unknown> = {}
  if (patch.code !== undefined) values.code = patch.code
  if (patch.title !== undefined) values.title = patch.title
  if (patch.description !== undefined) values.description = patch.description
  if (patch.isArchived !== undefined) values.is_archived = patch.isArchived
  const row = unwrap(await adminDb.from('courses').update(values).eq('id', id).select('id').maybeSingle())
  return row ? findById(id) : null
}

export async function replaceTeachers(courseId: string, teacherIds: string[]): Promise<void> {
  let remove = adminDb.from('course_teachers').delete().eq('course_id', courseId)
  if (teacherIds.length > 0) remove = remove.not('teacher_id', 'in', `(${teacherIds.join(',')})`)
  unwrap(await remove)
  if (teacherIds.length > 0) {
    unwrap(
      await adminDb
        .from('course_teachers')
        .upsert(
          teacherIds.map((teacherId) => ({ course_id: courseId, teacher_id: teacherId })),
          { onConflict: 'course_id,teacher_id', ignoreDuplicates: true },
        ),
    )
  }
}

export interface RosterStudent {
  id: string
  fullName: string
  email: string
  rollNo: string | null
  enrolledAt: string
}

export async function listRoster(courseId: string, search: string | undefined, pagination: Pagination) {
  const [from, to] = toRange(pagination)
  let query = adminDb
    .from('enrollments')
    .select('enrolled_at, student:profiles!inner(id,full_name,email,roll_no)', { count: 'exact' })
    .eq('course_id', courseId)
    .order('enrolled_at', { ascending: false })
    .range(from, to)
  const term = search ? escapeSearch(search) : ''
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,roll_no.ilike.%${term}%`, { referencedTable: 'student' })
  const { rows, total } = unwrapCount(
    await query.returns<Array<{ enrolled_at: string; student: { id: string; full_name: string; email: string; roll_no: string | null } }>>(),
  )
  return {
    total,
    rows: rows.map(
      (r): RosterStudent => ({
        id: r.student.id,
        fullName: r.student.full_name,
        email: r.student.email,
        rollNo: r.student.roll_no,
        enrolledAt: r.enrolled_at,
      }),
    ),
  }
}

export async function enrolledStudentIds(courseId: string, studentIds?: string[]): Promise<Set<string>> {
  let query = adminDb.from('enrollments').select('student_id').eq('course_id', courseId)
  if (studentIds) query = query.in('student_id', studentIds)
  const rows = unwrap(await query) as Array<{ student_id: string }>
  return new Set(rows.map((r) => r.student_id))
}

/** Idempotent: existing enrollments are left untouched. Returns how many were added. */
export async function addEnrollments(courseId: string, studentIds: string[]): Promise<number> {
  if (studentIds.length === 0) return 0
  const rows = unwrap(
    await adminDb
      .from('enrollments')
      .upsert(
        studentIds.map((studentId) => ({ course_id: courseId, student_id: studentId })),
        { onConflict: 'course_id,student_id', ignoreDuplicates: true },
      )
      .select('student_id'),
  ) as Array<{ student_id: string }> | null
  return rows?.length ?? 0
}

export async function removeEnrollment(courseId: string, studentId: string): Promise<boolean> {
  const rows = unwrap(
    await adminDb.from('enrollments').delete().eq('course_id', courseId).eq('student_id', studentId).select('student_id'),
  ) as Array<{ student_id: string }>
  return rows.length > 0
}

export interface Member {
  id: string
  fullName: string
  role: 'teacher' | 'student'
  rollNo: string | null
  email: string
}

export async function members(courseId: string): Promise<Member[]> {
  const [teachers, students] = await Promise.all([
    adminDb.from('course_teachers').select('p:profiles!inner(id,full_name,email,roll_no)').eq('course_id', courseId),
    adminDb.from('enrollments').select('p:profiles!inner(id,full_name,email,roll_no)').eq('course_id', courseId),
  ])
  type Row = { p: { id: string; full_name: string; email: string; roll_no: string | null } }
  const map = (rows: Row[], role: Member['role']) =>
    rows.map((r) => ({ id: r.p.id, fullName: r.p.full_name, email: r.p.email, rollNo: r.p.roll_no, role }))
  return [
    ...map(unwrap(teachers) as unknown as Row[], 'teacher'),
    ...map(unwrap(students) as unknown as Row[], 'student').sort((a, b) => a.fullName.localeCompare(b.fullName)),
  ]
}

export async function countActive(): Promise<number> {
  const { count, error } = await adminDb.from('courses').select('id', { count: 'exact', head: true }).eq('is_archived', false)
  if (error) throw error
  return count ?? 0
}
