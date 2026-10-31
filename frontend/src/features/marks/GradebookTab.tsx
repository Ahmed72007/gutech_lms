import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { FileSpreadsheet, GraduationCap } from 'lucide-react'
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { EmptyState, ListSkeleton, Pagination, QueryState } from '@/components/ui/states'
import { downloadBlob, errorMessage, request } from '@/lib/api'
import type { Gradebook, PageMeta } from '@/lib/types'
import { cn, formatMarks } from '@/lib/utils'

export function GradebookTab({ courseId }: { courseId: string }) {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const query = useQuery({
    queryKey: ['gradebook', courseId, page],
    queryFn: () => request<{ data: Gradebook; meta: PageMeta }>(`/courses/${courseId}/gradebook`, { query: { page, pageSize: 50 } }),
    placeholderData: keepPreviousData,
  })

  async function exportCsv() {
    setExporting(true)
    try {
      await downloadBlob(`/courses/${courseId}/gradebook.csv`, 'gradebook.csv')
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setExporting(false)
    }
  }

  return (
    <QueryState
      query={query}
      loading={<ListSkeleton rows={5} />}
      isEmpty={(r) => r.data.rows.length === 0 || r.data.items.length === 0}
      empty={<EmptyState icon={GraduationCap} title="Nothing to grade yet" description="The gradebook fills in once there are students and assignments or quizzes." />}
    >
      {({ data, meta }) => (
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-muted-foreground">Click a cell to open grading. Totals count graded items only.</p>
            <Button variant="outline" onClick={() => void exportCsv()} loading={exporting}>
              <FileSpreadsheet /> Export CSV
            </Button>
          </div>
          <div className="scrollbar-thin overflow-x-auto rounded-xl border bg-card shadow-soft">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-52 border-b border-r bg-card px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Student
                  </th>
                  {data.items.map((item) => (
                    <th key={item.id} className="min-w-28 border-b bg-muted/40 px-3 py-3 text-center text-xs font-semibold" title={item.title}>
                      <span className="line-clamp-2">{item.title}</span>
                      <span className="mt-0.5 block font-normal capitalize text-muted-foreground">
                        {item.kind} · /{formatMarks(item.max)}
                      </span>
                    </th>
                  ))}
                  <th className="min-w-28 border-b bg-muted/40 px-3 py-3 text-center text-xs font-semibold uppercase">Total</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.student.id} className="group">
                    <td className="sticky left-0 z-10 border-b border-r bg-card px-4 py-2.5 group-hover:bg-muted">
                      <p className="truncate font-medium">{row.student.fullName}</p>
                      <p className="truncate text-xs text-muted-foreground">{row.student.rollNo ?? row.student.email}</p>
                    </td>
                    {row.cells.map((cell, i) => {
                      const item = data.items[i]
                      if (!item) return null
                      const pct = cell.obtained !== null && item.max > 0 ? cell.obtained / item.max : null
                      return (
                        <td key={cell.itemId} className="border-b p-1 text-center group-hover:bg-muted/40">
                          <button
                            type="button"
                            onClick={() => navigate(item.kind === 'assignment' ? `/assignments/${item.id}?student=${row.student.id}` : `/quizzes/${item.id}`)}
                            className={cn(
                              'w-full rounded-md px-2 py-1.5 font-semibold tabular-nums transition hover:bg-primary-soft hover:text-primary',
                              cell.status === 'missing' && 'font-normal text-muted-foreground/60',
                              cell.status === 'pending' && 'text-xs font-medium text-warning',
                              pct !== null && pct < 0.5 && 'text-danger',
                            )}
                            aria-label={`${row.student.fullName}, ${item.title}: ${cell.status === 'graded' ? formatMarks(cell.obtained) : cell.status}`}
                          >
                            {cell.status === 'graded' ? formatMarks(cell.obtained) : cell.status === 'pending' ? 'Pending' : '—'}
                          </button>
                        </td>
                      )
                    })}
                    <td className="border-b px-3 py-2.5 text-center group-hover:bg-muted/40">
                      <p className="font-display font-bold">{row.totals.percentage === null ? '—' : `${formatMarks(row.totals.percentage)}%`}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatMarks(row.totals.obtained)}/{formatMarks(row.totals.max)}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPage={setPage} />
        </div>
      )}
    </QueryState>
  )
}
