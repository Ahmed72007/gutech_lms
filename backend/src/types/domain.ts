import type { SupabaseClient } from '@supabase/supabase-js'

export type Role = 'admin' | 'teacher' | 'student'

export interface Profile {
  id: string
  fullName: string
  email: string
  role: Role
  rollNo: string | null
  phone: string | null
  bio: string | null
  avatarPath: string | null
  isActive: boolean
  mustChangePassword: boolean
  createdAt: string
  updatedAt: string
}

/** Who is calling and a database client scoped to their JWT (RLS applies). */
export interface RequestContext {
  user: Profile
  db: SupabaseClient
  accessToken: string
}

export interface PageMeta {
  page: number
  pageSize: number
  total: number
}

export interface Paged<T> {
  data: T[]
  meta: PageMeta
}

export interface UploadedFile {
  buffer: Buffer
  originalName: string
  size: number
}
