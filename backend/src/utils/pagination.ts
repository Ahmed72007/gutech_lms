import type { PageMeta } from '../types/domain.js'

export interface Pagination {
  page: number
  pageSize: number
}

/** Inclusive row range for Supabase `.range(from, to)`. */
export function toRange({ page, pageSize }: Pagination): [number, number] {
  const from = (page - 1) * pageSize
  return [from, from + pageSize - 1]
}

export function pageMeta({ page, pageSize }: Pagination, total: number): PageMeta {
  return { page, pageSize, total }
}
