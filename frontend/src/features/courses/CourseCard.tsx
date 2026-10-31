import { ArrowUpRight, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import type { Course } from '@/lib/types'
import { cn } from '@/lib/utils'

/** Deterministic gradient per course code so each course has its own identity. */
const COVERS = [
  'from-teal-600 via-emerald-600 to-cyan-700',
  'from-amber-500 via-orange-500 to-rose-500',
  'from-sky-600 via-indigo-600 to-violet-600',
  'from-fuchsia-600 via-pink-600 to-rose-500',
  'from-lime-600 via-green-600 to-teal-600',
  'from-slate-700 via-slate-800 to-teal-800',
]

export function courseCover(code: string) {
  return COVERS[[...code].reduce((sum, ch) => sum + ch.charCodeAt(0), 0) % COVERS.length] ?? COVERS[0]
}

export function CourseCard({ course, showStudents, to }: { course: Course; showStudents?: boolean; to?: string }) {
  return (
    <Link
      to={to ?? `/courses/${course.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border bg-card shadow-soft transition duration-200 hover:-translate-y-1 hover:shadow-lift focus-visible:ring-2"
    >
      <div className={cn('relative h-24 bg-gradient-to-br p-4 text-white', courseCover(course.code))}>
        <div className="grid-pattern absolute inset-0 opacity-40" aria-hidden />
        <div className="relative flex items-start justify-between">
          <span className="rounded-md bg-white/20 px-2 py-0.5 font-display text-sm font-bold backdrop-blur">{course.code}</span>
          <ArrowUpRight className="size-5 opacity-0 transition group-hover:opacity-100" />
        </div>
        {course.isArchived && <Badge variant="neutral" className="absolute bottom-3 right-3">Archived</Badge>}
      </div>
      <div className="flex flex-1 flex-col p-4">
        <h3 className="line-clamp-2 font-display text-base font-semibold leading-snug">{course.title}</h3>
        {course.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{course.description}</p>}
        <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs text-muted-foreground">
          <span className="truncate">{course.teachers.length ? course.teachers.map((t) => t.fullName).join(', ') : 'No teacher assigned'}</span>
          {showStudents && (
            <span className="inline-flex shrink-0 items-center gap-1">
              <Users className="size-3.5" /> {course.studentCount}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
