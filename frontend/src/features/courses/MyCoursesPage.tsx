import { BookOpen, Search } from 'lucide-react'
import { useState } from 'react'
import { PageHeader } from '@/components/shared'
import { Input } from '@/components/ui/input'
import { CardGridSkeleton, EmptyState, QueryState } from '@/components/ui/states'
import { useUser } from '@/features/auth/AuthProvider'
import { CourseCard } from './CourseCard'
import { useMyCourses } from './api'

export function MyCoursesPage() {
  const user = useUser()
  const query = useMyCourses()
  const [search, setSearch] = useState('')
  const isTeacher = user.role === 'teacher'
  const term = search.trim().toLowerCase()

  return (
    <>
      <PageHeader
        eyebrow={isTeacher ? 'Teaching' : 'Learning'}
        title={isTeacher ? 'My classes' : 'My courses'}
        description={isTeacher ? 'Courses you teach this term.' : 'Courses you are enrolled in this term.'}
        actions={
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Filter courses" className="pl-9" aria-label="Filter courses" />
          </div>
        }
      />
      <QueryState
        query={query}
        loading={<CardGridSkeleton count={6} />}
        isEmpty={(courses) => courses.length === 0}
        empty={
          <EmptyState
            icon={BookOpen}
            title={isTeacher ? 'No classes assigned yet' : 'You are not enrolled in any course yet'}
            description="The admin team manages course assignments. Check back soon."
          />
        }
      >
        {(courses) => {
          const visible = courses.filter((c) => !term || `${c.code} ${c.title}`.toLowerCase().includes(term))
          return visible.length === 0 ? (
            <EmptyState icon={Search} title="No matches" description="Try a different course code or title." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {visible.map((course, i) => (
                <div key={course.id} className="animate-fade-up" style={{ animationDelay: `${i * 40}ms` }}>
                  <CourseCard course={course} showStudents={isTeacher} />
                </div>
              ))}
            </div>
          )
        }}
      </QueryState>
    </>
  )
}
