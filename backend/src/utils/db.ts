import type { PostgrestError } from '@supabase/supabase-js'

/** A database failure carrying the Postgres / PostgREST error code for HTTP mapping. */
export class DbError extends Error {
  constructor(
    readonly pgCode: string | undefined,
    message: string,
  ) {
    super(message)
    this.name = 'DbError'
  }
}

interface QueryResult<T> {
  data: T | null
  error: PostgrestError | null
}

/** Returns data or throws a DbError. `null` data is returned as-is (maybeSingle). */
export function unwrap<T>(result: QueryResult<T>): T {
  if (result.error) throw new DbError(result.error.code, result.error.message)
  return result.data as T
}

/** Returns data and the exact count from a `{ count: 'exact' }` query. */
export function unwrapCount<T>(result: QueryResult<T[]> & { count: number | null }): { rows: T[]; total: number } {
  if (result.error) throw new DbError(result.error.code, result.error.message)
  return { rows: result.data ?? [], total: result.count ?? 0 }
}

/** Removes characters that would break a PostgREST `or()` / `ilike` filter. */
export function escapeSearch(term: string): string {
  return term.replace(/[,%()*\\:"']/g, ' ').trim()
}

export function toNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}
