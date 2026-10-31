import type { SupabaseClient } from '@supabase/supabase-js'
import { adminDb } from '../config/supabase.js'
import type { Profile, Role } from '../types/domain.js'
import { escapeSearch, unwrap, unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

export const PROFILE_COLUMNS =
  'id,full_name,email,role,roll_no,phone,bio,avatar_path,is_active,must_change_password,created_at,updated_at'

interface ProfileRow {
  id: string
  full_name: string
  email: string
  role: Role
  roll_no: string | null
  phone: string | null
  bio: string | null
  avatar_path: string | null
  is_active: boolean
  must_change_password: boolean
  created_at: string
  updated_at: string
}

export function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    rollNo: row.roll_no,
    phone: row.phone,
    bio: row.bio,
    avatarPath: row.avatar_path,
    isActive: row.is_active,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export async function findById(id: string): Promise<Profile | null> {
  const row = unwrap(await adminDb.from('profiles').select(PROFILE_COLUMNS).eq('id', id).maybeSingle<ProfileRow>())
  return row ? toProfile(row) : null
}

export async function findByEmail(email: string): Promise<Profile | null> {
  const row = unwrap(await adminDb.from('profiles').select(PROFILE_COLUMNS).eq('email', email).maybeSingle<ProfileRow>())
  return row ? toProfile(row) : null
}

export interface ProfileSummary {
  id: string
  fullName: string
  email: string
  role: Role
  isActive: boolean
}

export async function findSummaries(filter: { ids?: string[]; emails?: string[] }): Promise<ProfileSummary[]> {
  let query = adminDb.from('profiles').select('id,full_name,email,role,is_active')
  if (filter.ids) query = query.in('id', filter.ids)
  if (filter.emails) query = query.in('email', filter.emails)
  const rows = unwrap(await query) as Array<{ id: string; full_name: string; email: string; role: Role; is_active: boolean }>
  return rows.map((r) => ({ id: r.id, fullName: r.full_name, email: r.email, role: r.role, isActive: r.is_active }))
}

export async function insert(input: { id: string; fullName: string; email: string; role: Role; rollNo: string | null }): Promise<Profile> {
  const row = unwrap(
    await adminDb
      .from('profiles')
      .insert({
        id: input.id,
        full_name: input.fullName,
        email: input.email,
        role: input.role,
        roll_no: input.rollNo,
        must_change_password: true,
      })
      .select(PROFILE_COLUMNS)
      .single<ProfileRow>(),
  )
  return toProfile(row)
}

export interface AdminProfilePatch {
  fullName?: string
  role?: Role
  isActive?: boolean
  rollNo?: string | null
  mustChangePassword?: boolean
}

export async function update(id: string, patch: AdminProfilePatch): Promise<Profile | null> {
  const values: Record<string, unknown> = {}
  if (patch.fullName !== undefined) values.full_name = patch.fullName
  if (patch.role !== undefined) values.role = patch.role
  if (patch.isActive !== undefined) values.is_active = patch.isActive
  if (patch.rollNo !== undefined) values.roll_no = patch.rollNo
  if (patch.mustChangePassword !== undefined) values.must_change_password = patch.mustChangePassword
  const row = unwrap(await adminDb.from('profiles').update(values).eq('id', id).select(PROFILE_COLUMNS).maybeSingle<ProfileRow>())
  return row ? toProfile(row) : null
}

export interface OwnProfilePatch {
  fullName?: string
  phone?: string | null
  bio?: string | null
  avatarPath?: string | null
}

/** Runs as the user: RLS plus column grants limit it to their own descriptive fields. */
export async function updateOwn(db: SupabaseClient, id: string, patch: OwnProfilePatch): Promise<Profile> {
  const values: Record<string, unknown> = {}
  if (patch.fullName !== undefined) values.full_name = patch.fullName
  if (patch.phone !== undefined) values.phone = patch.phone
  if (patch.bio !== undefined) values.bio = patch.bio
  if (patch.avatarPath !== undefined) values.avatar_path = patch.avatarPath
  const row = unwrap(await db.from('profiles').update(values).eq('id', id).select(PROFILE_COLUMNS).single<ProfileRow>())
  return toProfile(row)
}

export async function list(
  filter: { search?: string; role?: Role; status?: 'active' | 'inactive' },
  pagination: Pagination,
): Promise<{ rows: Profile[]; total: number }> {
  const [from, to] = toRange(pagination)
  let query = adminDb
    .from('profiles')
    .select(PROFILE_COLUMNS, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to)
  if (filter.role) query = query.eq('role', filter.role)
  if (filter.status) query = query.eq('is_active', filter.status === 'active')
  const term = filter.search ? escapeSearch(filter.search) : ''
  if (term) query = query.or(`full_name.ilike.%${term}%,email.ilike.%${term}%,roll_no.ilike.%${term}%`)
  const { rows, total } = unwrapCount<ProfileRow>(await query)
  return { rows: rows.map(toProfile), total }
}

export async function countByRole(): Promise<Record<Role, number>> {
  const roles: Role[] = ['admin', 'teacher', 'student']
  const counts = await Promise.all(
    roles.map(async (role) => {
      const { count, error } = await adminDb.from('profiles').select('id', { count: 'exact', head: true }).eq('role', role)
      if (error) throw error
      return [role, count ?? 0] as const
    }),
  )
  return Object.fromEntries(counts) as Record<Role, number>
}
