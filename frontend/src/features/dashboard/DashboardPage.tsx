import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  GraduationCap,
  Megaphone,
  ShieldAlert,
  Sparkles,
  Timer,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { ComplaintChip, Countdown, SectionTitle, StatCard } from '@/components/shared'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, Progress, Skeleton } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { AnnouncementCard } from '@/features/announcements/AnnouncementCard'
import { useAnnouncements } from '@/features/announcements/api'
import { useUser } from '@/features/auth/AuthProvider'
import { CourseCard } from '@/features/courses/CourseCard'
import { useDashboard } from '@/features/courses/api'
import type { AdminDashboard, StudentDashboard, TeacherDashboard } from '@/lib/types'
import { formatDateTime, formatMarks, pluralize, timeAgo } from '@/lib/utils'

function greeting() {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

function Hero({ subtitle }: { subtitle: string }) {
  const user = useUser()
  return (
    <section className="hero-surface relative mb-6 overflow-hidden rounded-2xl border p-5 shadow-soft sm:mb-8 sm:p-8">
      <div className="absolute -right-10 -top-10 size-48 rounded-full bg-primary/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center gap-4">
        <Avatar name={user.fullName} src={user.avatarUrl} className="hidden size-14 text-base ring-4 ring-card sm:inline-flex" />
        <div>
          <p className="text-sm font-medium text-primary">{greeting()},</p>
          <h1 className="text-2xl font-bold sm:text-3xl">{user.fullName.split(' ')[0]} 👋</h1>
          <p className="mt-1 text-sm text-muted-foreground sm:text-base">{subtitle}</p>
        </div>
      </div>
    </section>
  )
}

function LatestAnnouncements() {
  const query = useAnnouncements({ pageSize: 5 })
  return (
    <section>
      <SectionTitle
        title="Latest announcements"
        action={
          <Button asChild variant="ghost" size="sm">
            <Link to="/announcements">
              View all <ArrowRight />
            </Link>
          </Button>
        }
      />
      {query.isPending ? (
        <div className="space-y-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.data.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" description="Updates from your teachers and the admin team will appear here." />
      ) : (
        <div className="space-y-3">
          {query.data.data.map((a) => (
            <AnnouncementCard key={a.id} announcement={a} compact />
          ))}
        </div>
      )}
    </section>
  )
}

function DashboardSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <Skeleton className="mb-8 h-32" />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-28" />
        ))}
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Skeleton className="h-80" />
        <Skeleton className="h-80" />
      </div>
    </div>
  )
}

export function DashboardPage() {
  const query = useDashboard()
  if (query.isPending) return <DashboardSkeleton />
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  const data = query.data
  if (data.role === 'student') return <StudentView data={data} />
  if (data.role === 'teacher') return <TeacherView data={data} />
  return <AdminView data={data} />
}

function StudentView({ data }: { data: StudentDashboard }) {
  const due = data.upcomingAssignments.filter((a) => !a.submitted)
  return (
    <div className="animate-fade-up">
      <Hero subtitle={due.length ? `You have ${pluralize(due.length, 'assignment')} coming up. You've got this.` : 'You are all caught up. Nice work!'} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Courses" value={data.courses.length} />
        <StatCard icon={CalendarClock} label="Due soon" value={due.length} tone="accent" />
        <StatCard icon={Timer} label="Open quizzes" value={data.openQuizzes.length} tone="info" />
        <StatCard
          icon={GraduationCap}
          label="Overall"
          value={data.overall.percentage === null ? '—' : `${formatMarks(data.overall.percentage)}%`}
          hint={`${pluralize(data.overall.gradedCount, 'graded item')}`}
        />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section>
            <SectionTitle title="Upcoming work" />
            {data.upcomingAssignments.length === 0 && data.openQuizzes.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="Nothing due" description="New assignments and quizzes will show up here." />
            ) : (
              <Card>
                <ul className="divide-y">
                  {data.openQuizzes.map((q) => (
                    <li key={q.id}>
                      <Link to={`/quizzes/${q.id}`} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
                          <Timer className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{q.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {q.course?.code} · {q.timeLimitMinutes} min · closes {formatDateTime(q.closesAt)}
                          </p>
                        </div>
                        <Badge variant="success">Open</Badge>
                      </Link>
                    </li>
                  ))}
                  {data.upcomingAssignments.map((a) => (
                    <li key={a.id}>
                      <Link to={`/assignments/${a.id}`} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">
                        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                          <ClipboardCheck className="size-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{a.title}</p>
                          <p className="text-xs">
                            <span className="text-muted-foreground">{a.course?.code} · </span>
                            <Countdown to={a.dueAt} />
                          </p>
                        </div>
                        {a.submitted ? <Badge variant="success">Submitted</Badge> : <Badge variant="neutral">To do</Badge>}
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
          <section>
            <SectionTitle
              title="My courses"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/courses">
                    All courses <ArrowRight />
                  </Link>
                </Button>
              }
            />
            {data.courses.length === 0 ? (
              <EmptyState icon={BookOpen} title="No courses yet" description="Once the admin enrolls you, your courses appear here." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.courses.slice(0, 4).map((c) => (
                  <CourseCard key={c.id} course={c} />
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Recent marks</CardTitle>
            </CardHeader>
            <CardContent>
              {data.recentMarks.length === 0 ? (
                <p className="text-sm text-muted-foreground">No graded work yet.</p>
              ) : (
                <ul className="space-y-4">
                  {data.recentMarks.map((m) => {
                    const pct = m.max > 0 && m.obtained !== null ? (m.obtained / m.max) * 100 : 0
                    return (
                      <li key={`${m.kind}-${m.itemId}`}>
                        <div className="mb-1.5 flex items-center justify-between gap-2 text-sm">
                          <span className="truncate font-medium">{m.title}</span>
                          <span className="shrink-0 font-semibold tabular-nums">
                            {formatMarks(m.obtained)}/{formatMarks(m.max)}
                          </span>
                        </div>
                        <Progress value={pct} tone={pct >= 50 ? 'primary' : 'danger'} />
                      </li>
                    )
                  })}
                </ul>
              )}
              <Button asChild variant="outline" size="sm" className="mt-5 w-full">
                <Link to="/marks">View all marks</Link>
              </Button>
            </CardContent>
          </Card>
          <LatestAnnouncements />
        </div>
      </div>
    </div>
  )
}

function TeacherView({ data }: { data: TeacherDashboard }) {
  return (
    <div className="animate-fade-up">
      <Hero subtitle={data.toGrade.total ? `${pluralize(data.toGrade.total, 'submission')} waiting for your feedback.` : 'All submissions are graded. 🎉'} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={BookOpen} label="Classes" value={data.courses.length} />
        <StatCard icon={Users} label="Students" value={data.studentCount} tone="info" />
        <StatCard icon={ClipboardCheck} label="To grade" value={data.toGrade.total} tone="accent" />
        <StatCard icon={CalendarClock} label="Upcoming deadlines" value={data.upcomingDeadlines.length} />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-8">
          <section>
            <SectionTitle title="Needs grading" />
            {data.toGrade.rows.length === 0 ? (
              <EmptyState icon={Sparkles} title="Inbox zero" description="New submissions will appear here." />
            ) : (
              <Card>
                <ul className="divide-y">
                  {data.toGrade.rows.map((s) => (
                    <li key={s.id}>
                      <Link to={`/assignments/${s.assignment.id}`} className="flex items-center gap-3 p-4 transition hover:bg-muted/50">
                        <Avatar name={s.student?.fullName ?? 'Student'} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{s.student?.fullName}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {s.assignment.title} · {timeAgo(s.submittedAt)}
                          </p>
                        </div>
                        {s.isLate && <Badge variant="warning">Late</Badge>}
                        <ArrowRight className="size-4 text-muted-foreground" />
                      </Link>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </section>
          <section>
            <SectionTitle
              title="My classes"
              action={
                <Button asChild variant="ghost" size="sm">
                  <Link to="/courses">
                    All classes <ArrowRight />
                  </Link>
                </Button>
              }
            />
            {data.courses.length === 0 ? (
              <EmptyState icon={BookOpen} title="No classes assigned" description="An admin will assign you to courses." />
            ) : (
              <div className="grid gap-4 sm:grid-cols-2">
                {data.courses.slice(0, 4).map((c) => (
                  <CourseCard key={c.id} course={c} showStudents />
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Upcoming deadlines</CardTitle>
            </CardHeader>
            <CardContent>
              {data.upcomingDeadlines.length === 0 ? (
                <p className="text-sm text-muted-foreground">No deadlines coming up.</p>
              ) : (
                <ul className="space-y-3">
                  {data.upcomingDeadlines.map((a) => (
                    <li key={a.id}>
                      <Link to={`/assignments/${a.id}`} className="block rounded-lg border p-3 transition hover:border-primary/40 hover:bg-muted/40">
                        <p className="truncate text-sm font-medium">{a.title}</p>
                        <p className="text-xs text-muted-foreground">
                          {a.course?.code} · {formatDateTime(a.dueAt)}
                        </p>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
          <LatestAnnouncements />
        </div>
      </div>
    </div>
  )
}

function AdminView({ data }: { data: AdminDashboard }) {
  return (
    <div className="animate-fade-up">
      <Hero subtitle="Here is what is happening across the learning portal." />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard icon={GraduationCap} label="Students" value={data.users.student} />
        <StatCard icon={Users} label="Teachers" value={data.users.teacher} tone="info" />
        <StatCard icon={BookOpen} label="Active courses" value={data.activeCourses} tone="accent" />
        <StatCard icon={ShieldAlert} label="Open complaints" value={data.openComplaints} tone="danger" />
      </div>
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>New complaints</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/complaints">
                Queue <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentComplaints.length === 0 ? (
              <p className="text-sm text-muted-foreground">No open complaints. 🎉</p>
            ) : (
              <ul className="space-y-2">
                {data.recentComplaints.map((c) => (
                  <li key={c.id}>
                    <Link to={`/admin/complaints?open=${c.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition hover:bg-muted/40">
                      <AlertCircle className="size-4 shrink-0 text-danger" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{c.subject}</p>
                        <p className="text-xs capitalize text-muted-foreground">
                          {c.category} · {c.raisedBy?.fullName} · {timeAgo(c.createdAt)}
                        </p>
                      </div>
                      <ComplaintChip status={c.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Button asChild variant="ghost" size="sm">
              <Link to="/admin/audit">
                Audit log <ArrowRight />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recentAudit.length === 0 ? (
              <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
            ) : (
              <ol className="relative space-y-4 border-l pl-5">
                {data.recentAudit.map((e) => (
                  <li key={e.id} className="relative">
                    <span className="absolute -left-[26px] top-1.5 size-2.5 rounded-full bg-primary ring-4 ring-card" />
                    <p className="text-sm">
                      <span className="font-medium">{e.actor?.fullName ?? 'System'}</span>{' '}
                      <span className="text-muted-foreground">{e.action.replace(/[._]/g, ' ')}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">{timeAgo(e.at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        <div className="lg:col-span-2">
          <LatestAnnouncements />
        </div>
      </div>
    </div>
  )
}
