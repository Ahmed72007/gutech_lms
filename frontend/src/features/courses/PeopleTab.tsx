import { Users } from 'lucide-react'
import { RoleBadge } from '@/components/shared'
import { Card } from '@/components/ui/card'
import { Avatar } from '@/components/ui/primitives'
import { EmptyState, QueryState } from '@/components/ui/states'
import type { Member } from '@/lib/types'
import { useMembers } from './api'

function PersonRow({ person }: { person: Member }) {
  return (
    <li className="flex items-center gap-3 p-3 sm:p-4">
      <Avatar name={person.fullName} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{person.fullName}</p>
        <p className="truncate text-xs text-muted-foreground">{person.email || person.rollNo || ' '}</p>
      </div>
      {person.role === 'teacher' ? <RoleBadge role="teacher" /> : person.rollNo && <span className="text-xs font-medium text-muted-foreground">{person.rollNo}</span>}
    </li>
  )
}

export function PeopleTab({ courseId }: { courseId: string }) {
  const query = useMembers(courseId)
  return (
    <QueryState query={query} isEmpty={(m) => m.length === 0} empty={<EmptyState icon={Users} title="Nobody here yet" />}>
      {(members) => {
        const teachers = members.filter((m) => m.role === 'teacher')
        const students = members.filter((m) => m.role === 'student')
        return (
          <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">Teachers</h2>
              <Card>
                {teachers.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No teacher assigned.</p>
                ) : (
                  <ul className="divide-y">
                    {teachers.map((p) => (
                      <PersonRow key={p.id} person={p} />
                    ))}
                  </ul>
                )}
              </Card>
            </section>
            <section>
              <h2 className="mb-3 font-display text-lg font-semibold">
                Students <span className="text-sm font-normal text-muted-foreground">({students.length})</span>
              </h2>
              <Card>
                {students.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No students enrolled yet.</p>
                ) : (
                  <ul className="grid divide-y sm:grid-cols-2 sm:divide-y-0">
                    {students.map((p) => (
                      <PersonRow key={p.id} person={p} />
                    ))}
                  </ul>
                )}
              </Card>
            </section>
          </div>
        )
      }}
    </QueryState>
  )
}
