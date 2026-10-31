import { BookMarked, ClipboardList, FolderOpen, GraduationCap, LayoutGrid, Megaphone, MessageCircle, Timer, Users } from 'lucide-react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/primitives'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives'
import { ErrorState } from '@/components/ui/states'
import { AnnouncementsFeed } from '@/features/announcements/AnnouncementsPage'
import { AssignmentsTab } from '@/features/assignments/AssignmentsTab'
import { GradebookTab } from '@/features/marks/GradebookTab'
import { CourseMarks } from '@/features/marks/MyMarksPage'
import { QuizzesTab } from '@/features/quizzes/QuizzesTab'
import { ResourcesTab } from '@/features/resources/ResourcesTab'
import { useUser } from '@/features/auth/AuthProvider'
import { cn } from '@/lib/utils'
import { courseCover } from './CourseCard'
import { PeopleTab } from './PeopleTab'
import { useCourse } from './api'

const TABS = ['overview', 'resources', 'assignments', 'quizzes', 'marks', 'people'] as const
type Tab = (typeof TABS)[number]

export function CoursePage() {
  const { courseId = '' } = useParams()
  const user = useUser()
  const [params, setParams] = useSearchParams()
  const query = useCourse(courseId)
  const tab = (TABS as readonly string[]).includes(params.get('tab') ?? '') ? (params.get('tab') as Tab) : 'overview'

  if (query.isPending) {
    return (
      <div aria-busy="true">
        <Skeleton className="mb-6 h-44" />
        <Skeleton className="h-10 w-96 max-w-full" />
        <Skeleton className="mt-6 h-64" />
      </div>
    )
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />

  const course = query.data
  const canManage = course.viewer.canManage
  const backTo = user.role === 'admin' ? `/admin/courses/${course.id}` : '/courses'

  return (
    <div className="animate-fade-up">
      <section className={cn('relative mb-6 overflow-hidden rounded-2xl bg-gradient-to-br p-5 text-white shadow-lift sm:p-8', courseCover(course.code))}>
        <div className="grid-pattern absolute inset-0 opacity-40" aria-hidden />
        <div className="absolute -bottom-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl" aria-hidden />
        <div className="relative">
          <Link to={backTo} className="text-sm font-medium text-white/80 hover:text-white">
            ← {user.role === 'admin' ? 'Course admin' : user.role === 'teacher' ? 'My classes' : 'My courses'}
          </Link>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-md bg-white/20 px-2 py-0.5 font-display text-sm font-bold backdrop-blur">{course.code}</span>
            {course.isArchived && <Badge variant="neutral">Archived</Badge>}
            {canManage && <Badge className="bg-white/20 text-white">{user.role === 'admin' ? 'Admin view' : 'You teach this'}</Badge>}
          </div>
          <h1 className="mt-2 max-w-3xl text-2xl font-bold sm:text-4xl">{course.title}</h1>
          {course.description && <p className="mt-2 max-w-2xl text-sm text-white/85 sm:text-base">{course.description}</p>}
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/85">
            <span className="inline-flex items-center gap-1.5">
              <BookMarked className="size-4" /> {course.teachers.map((t) => t.fullName).join(', ') || 'No teacher yet'}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" /> {course.studentCount} students
            </span>
          </div>
          <Button asChild variant="secondary" size="sm" className="mt-5 bg-white text-ink hover:bg-white/90">
            <Link to={`/chat/${course.id}`}>
              <MessageCircle /> Open class chat
            </Link>
          </Button>
        </div>
      </section>

      <Tabs value={tab} onValueChange={(value) => setParams({ tab: value }, { replace: true })}>
        <TabsList aria-label="Course sections">
          <TabsTrigger value="overview">
            <LayoutGrid /> Overview
          </TabsTrigger>
          <TabsTrigger value="resources">
            <FolderOpen /> Resources
          </TabsTrigger>
          <TabsTrigger value="assignments">
            <ClipboardList /> Assignments
          </TabsTrigger>
          <TabsTrigger value="quizzes">
            <Timer /> Quizzes
          </TabsTrigger>
          {(canManage || course.viewer.isStudent) && (
            <TabsTrigger value="marks">
              <GraduationCap /> {canManage ? 'Gradebook' : 'My marks'}
            </TabsTrigger>
          )}
          <TabsTrigger value="people">
            <Users /> People
          </TabsTrigger>
        </TabsList>

        <div className="mt-6">
          <TabsContent value="overview">
            <div className="mb-3 flex items-center gap-2">
              <Megaphone className="size-5 text-primary" />
              <h2 className="font-display text-lg font-semibold">Course announcements</h2>
            </div>
            <AnnouncementsFeed courseId={course.id} canPost={canManage} />
          </TabsContent>
          <TabsContent value="resources">
            <ResourcesTab courseId={course.id} canManage={canManage} />
          </TabsContent>
          <TabsContent value="assignments">
            <AssignmentsTab courseId={course.id} canManage={canManage} />
          </TabsContent>
          <TabsContent value="quizzes">
            <QuizzesTab courseId={course.id} canManage={canManage} />
          </TabsContent>
          <TabsContent value="marks">{canManage ? <GradebookTab courseId={course.id} /> : <CourseMarks courseId={course.id} />}</TabsContent>
          <TabsContent value="people">
            <PeopleTab courseId={course.id} />
          </TabsContent>
        </div>
      </Tabs>
    </div>
  )
}
