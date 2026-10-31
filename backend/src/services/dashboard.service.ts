import * as accessRepository from '../repositories/access.repository.js'
import * as auditRepository from '../repositories/audit.repository.js'
import * as complaintRepository from '../repositories/complaint.repository.js'
import * as courseRepository from '../repositories/course.repository.js'
import * as dashboardRepository from '../repositories/dashboard.repository.js'
import * as profileRepository from '../repositories/profile.repository.js'
import type { RequestContext } from '../types/domain.js'
import { now } from '../utils/time.js'
import { totals } from './marks.service.js'

async function studentDashboard(ctx: RequestContext) {
  const courseIds = await accessRepository.courseIdsFor(ctx.user.id, 'student')
  const at = now()
  const [courses, assignments, quizzes, marks] = await Promise.all([
    courseRepository.listByIds(ctx.db, courseIds),
    dashboardRepository.upcomingAssignments(courseIds, at, 12),
    dashboardRepository.openQuizzes(courseIds, at, 10),
    dashboardRepository.studentMarkRows(ctx.user.id),
  ])
  const [submitted, attempted] = await Promise.all([
    dashboardRepository.submittedAssignmentIds(
      ctx.user.id,
      assignments.map((a) => a.id),
    ),
    dashboardRepository.attemptedQuizIds(
      ctx.user.id,
      quizzes.map((q) => q.id),
    ),
  ])

  return {
    role: 'student' as const,
    courses: courses.filter((c) => !c.isArchived),
    upcomingAssignments: assignments.map((a) => ({ ...a, submitted: submitted.has(a.id) })).slice(0, 6),
    openQuizzes: quizzes.filter((q) => !attempted.has(q.id)).slice(0, 5),
    recentMarks: marks
      .filter((m) => m.obtained !== null)
      .sort((a, b) => (b.gradedAt ?? '').localeCompare(a.gradedAt ?? ''))
      .slice(0, 5),
    overall: totals(marks),
  }
}

async function teacherDashboard(ctx: RequestContext) {
  const courseIds = await accessRepository.courseIdsFor(ctx.user.id, 'teacher')
  const [courses, studentCount, toGrade, deadlines] = await Promise.all([
    courseRepository.listByIds(ctx.db, courseIds),
    dashboardRepository.distinctStudentCount(courseIds),
    dashboardRepository.ungradedSubmissions(courseIds, 6),
    dashboardRepository.upcomingAssignments(courseIds, now(), 5),
  ])
  return {
    role: 'teacher' as const,
    courses: courses.filter((c) => !c.isArchived),
    studentCount,
    toGrade,
    upcomingDeadlines: deadlines,
  }
}

async function adminDashboard() {
  const [users, activeCourses, openComplaints, recentAudit, recentComplaints] = await Promise.all([
    profileRepository.countByRole(),
    courseRepository.countActive(),
    complaintRepository.countOpen(),
    auditRepository.list({}, { page: 1, pageSize: 6 }),
    complaintRepository.listAll({ status: 'open' }, { page: 1, pageSize: 5 }),
  ])
  return {
    role: 'admin' as const,
    users,
    activeCourses,
    openComplaints,
    recentAudit: recentAudit.rows,
    recentComplaints: recentComplaints.rows.map((c) => ({
      id: c.id,
      subject: c.subject,
      category: c.category,
      status: c.status,
      createdAt: c.createdAt,
      raisedBy: c.raisedBy,
    })),
  }
}

export async function dashboard(ctx: RequestContext) {
  if (ctx.user.role === 'student') return studentDashboard(ctx)
  if (ctx.user.role === 'teacher') return teacherDashboard(ctx)
  return adminDashboard()
}
