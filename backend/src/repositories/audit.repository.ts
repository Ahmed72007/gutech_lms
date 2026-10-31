import { adminDb } from '../config/supabase.js'
import { logger } from '../config/logger.js'
import { unwrapCount } from '../utils/db.js'
import { toRange, type Pagination } from '../utils/pagination.js'

/** Records who did what. Failures are logged but never break the user's action. */
export async function record(actorId: string, action: string, entity: string, entityId?: string | null): Promise<void> {
  const { error } = await adminDb.from('audit_log').insert({ actor_id: actorId, action, entity, entity_id: entityId ?? null })
  if (error) logger.error({ err: error, action, entity }, 'Failed to write audit log')
}

export interface AuditEntry {
  id: number
  action: string
  entity: string
  entityId: string | null
  at: string
  actor: { id: string; fullName: string; role: string } | null
}

export async function list(filter: { entity?: string }, pagination: Pagination): Promise<{ rows: AuditEntry[]; total: number }> {
  const [from, to] = toRange(pagination)
  let query = adminDb
    .from('audit_log')
    .select('id,action,entity,entity_id,at,actor:profiles(id,full_name,role)', { count: 'exact' })
    .order('at', { ascending: false })
    .range(from, to)
  if (filter.entity) query = query.eq('entity', filter.entity)
  const { rows, total } = unwrapCount(
    await query.returns<
      Array<{ id: number; action: string; entity: string; entity_id: string | null; at: string; actor: { id: string; full_name: string; role: string } | null }>
    >(),
  )
  return {
    total,
    rows: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entity_id,
      at: r.at,
      actor: r.actor ? { id: r.actor.id, fullName: r.actor.full_name, role: r.actor.role } : null,
    })),
  }
}
