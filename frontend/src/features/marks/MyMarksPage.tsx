import { useQuery } from '@tanstack/react-query'
import { GraduationCap, ListChecks, ClipboardList } from 'lucide-react'
import { PageHeader, StatCard } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress, Table, TableWrap, Td, Th } from '@/components/ui/primitives'
import { EmptyState, ListSkeleton, QueryState } from '@/components/ui/states'
import { apiGet } from '@/lib/api'
import type { MyMarks, Totals } from '@/lib/types'
import { formatDate, formatMarks, pluralize } from '@/lib/utils'

function useMyMarks(courseId?: string) {
  return useQuery({ queryKey: ['marks', 'mine', courseId ?? 'all'], queryFn: () => apiGet<MyMarks>('/me/marks', { courseId }) })
}

function Percentage({ totals }: { totals: Totals }) {
  if (totals.percentage === null) return <span className="text-muted-foreground">—</span>
  return <span>{formatMarks(totals.percentage)}%</span>
}

function MarksTable({ data }: { data: MyMarks['courses'][number] }) {
  return (
    <TableWrap className="border-0 shadow-none">
      <Table>
        <thead>
          <tr>
            <Th>Item</Th>
            <Th className="hidden sm:table-cell">Type</Th>
            <Th className="hidden sm:table-cell">Graded</Th>
            <Th className="text-right">Marks</Th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((m) => (
            <tr key={`${m.kind}-${m.itemId}`}>
              <Td className="font-medium">
                {m.title}
                <span className="mt-0.5 block text-xs capitalize text-muted-foreground sm:hidden">{m.kind}</span>
              </Td>
              <Td className="hidden capitalize text-muted-foreground sm:table-cell">
                <span className="inline-flex items-center gap-1.5">
                  {m.kind === 'quiz' ? <ListChecks className="size-4" /> : <ClipboardList className="size-4" />}
                  {m.kind}
                </span>
              </Td>
              <Td className="hidden text-muted-foreground sm:table-cell">{m.gradedAt ? formatDate(m.gradedAt) : '—'}</Td>
              <Td className="text-right font-semibold tabular-nums">
                {m.status === 'pending' ? (
                  <Badge variant="neutral">Pending</Badge>
                ) : (
                  <>
                    {formatMarks(m.obtained)}
                    <span className="text-muted-foreground">/{formatMarks(m.max)}</span>
                  </>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-muted/40 font-semibold">
            <Td>Total (graded items)</Td>
            <Td className="hidden sm:table-cell" />
            <Td className="hidden sm:table-cell" />
            <Td className="text-right tabular-nums">
              {formatMarks(data.totals.obtained)}/{formatMarks(data.totals.max)} · <Percentage totals={data.totals} />
            </Td>
          </tr>
        </tfoot>
      </Table>
    </TableWrap>
  )
}

/** Marks for one course (course page "My marks" tab). */
export function CourseMarks({ courseId }: { courseId: string }) {
  const query = useMyMarks(courseId)
  return (
    <QueryState
      query={query}
      loading={<ListSkeleton rows={3} />}
      isEmpty={(d) => d.courses.length === 0}
      empty={<EmptyState icon={GraduationCap} title="No marks yet" description="Marks appear here once your teacher grades your work." />}
    >
      {(d) => {
        const course = d.courses[0]
        return course ? (
          <Card>
            <CardContent className="p-0">
              <MarksTable data={course} />
            </CardContent>
          </Card>
        ) : null
      }}
    </QueryState>
  )
}

export function MyMarksPage() {
  const query = useMyMarks()
  return (
    <>
      <PageHeader eyebrow="Progress" title="My marks" description="Percentages count graded items only. Ungraded work shows as pending." />
      <QueryState
        query={query}
        loading={<ListSkeleton rows={4} />}
        isEmpty={(d) => d.courses.length === 0}
        empty={<EmptyState icon={GraduationCap} title="No marks yet" description="Submit assignments and take quizzes — your marks will appear here after grading." />}
      >
        {(d) => (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
              <StatCard icon={GraduationCap} label="Overall" value={<Percentage totals={d.overall} />} hint={`${formatMarks(d.overall.obtained)} / ${formatMarks(d.overall.max)} marks`} />
              <StatCard icon={ClipboardList} label="Graded" value={d.overall.gradedCount} tone="info" />
              <StatCard icon={ListChecks} label="Pending" value={d.overall.pendingCount} tone="accent" />
            </div>
            {d.courses.map((c) => (
              <Card key={c.course.id} className="overflow-hidden">
                <CardHeader className="gap-3 border-b bg-muted/30 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <CardTitle>
                      <span className="text-primary">{c.course.code}</span> · {c.course.title}
                    </CardTitle>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {pluralize(c.totals.gradedCount, 'graded item')}
                      {c.totals.pendingCount > 0 && ` · ${c.totals.pendingCount} pending`}
                    </p>
                  </div>
                  <div className="w-full sm:w-56">
                    <div className="mb-1 flex justify-between text-sm font-semibold">
                      <span>Course total</span>
                      <Percentage totals={c.totals} />
                    </div>
                    <Progress value={c.totals.percentage ?? 0} tone={(c.totals.percentage ?? 0) >= 50 ? 'primary' : 'danger'} />
                  </div>
                </CardHeader>
                <CardContent className="p-0">
                  <MarksTable data={c} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </QueryState>
    </>
  )
}
