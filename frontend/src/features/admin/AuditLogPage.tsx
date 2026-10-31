import { ScrollText } from 'lucide-react'
import { useState } from 'react'
import { PageHeader, RoleBadge } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Select } from '@/components/ui/input'
import { Avatar, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { formatDateTime } from '@/lib/utils'
import { useAuditLog } from './api'

const ENTITIES = ['profile', 'course', 'enrollment', 'submission', 'assignment', 'quiz', 'resource', 'announcement', 'chat_message', 'complaint']

export function AuditLogPage() {
  const [page, setPage] = useState(1)
  const [entity, setEntity] = useState('')
  const query = useAuditLog(page, entity)
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Audit log"
        description="Who graded, deleted or changed what — newest first."
        actions={
          <Select value={entity} onChange={(e) => (setEntity(e.target.value), setPage(1))} aria-label="Filter by entity" className="w-48">
            <option value="">All entities</option>
            {ENTITIES.map((e) => (
              <option key={e} value={e}>
                {e.replace('_', ' ')}
              </option>
            ))}
          </Select>
        }
      />
      <QueryState query={query} loading={<ListSkeleton rows={8} />} isEmpty={(r) => r.data.length === 0} empty={<EmptyState icon={ScrollText} title="No entries" />}>
        {({ data, meta }) => (
          <>
            <TableWrap>
              <Table>
                <thead>
                  <tr>
                    <Th>When</Th>
                    <Th>Actor</Th>
                    <Th>Action</Th>
                    <Th className="hidden md:table-cell">Record</Th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((e) => (
                    <tr key={e.id}>
                      <Td className="whitespace-nowrap text-muted-foreground">{formatDateTime(e.at)}</Td>
                      <Td>
                        {e.actor ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={e.actor.fullName} className="size-7" />
                            <span className="truncate">{e.actor.fullName}</span>
                            <span className="hidden lg:inline">
                              <RoleBadge role={e.actor.role} />
                            </span>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">System</span>
                        )}
                      </Td>
                      <Td>
                        <Badge variant="outline" className="font-mono">
                          {e.action}
                        </Badge>
                      </Td>
                      <Td className="hidden font-mono text-xs text-muted-foreground md:table-cell">
                        {e.entity}
                        {e.entityId && ` · ${e.entityId.slice(0, 8)}`}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
            <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
          </>
        )}
      </QueryState>
    </>
  )
}
