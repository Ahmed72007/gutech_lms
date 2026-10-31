import type { ComponentType } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { GuestOnly, HomeRedirect, RequireAuth, RequireRole } from '@/features/auth/guards'
import { LoginPage } from '@/features/auth/LoginPage'
import { ForcedChangePasswordPage, ForgotPasswordPage, ResetPasswordPage } from '@/features/auth/PasswordPages'
import { AppShell } from './AppShell'
import { NotFoundPage } from './NotFoundPage'

/** Route-level code splitting: each feature page loads on first visit. */
function page<M extends Record<string, unknown>>(load: () => Promise<M>, name: keyof M & string) {
  return async () => ({ Component: (await load())[name] as ComponentType })
}

const dashboard = page(() => import('@/features/dashboard/DashboardPage'), 'DashboardPage')

// There is deliberately no /signup route: /signup falls through to the 404 page.
export const router = createBrowserRouter([
  {
    element: <GuestOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/forgot-password', element: <ForgotPasswordPage /> },
    ],
  },
  // Reachable signed in or out: the recovery link carries its own token.
  { path: '/reset-password', element: <ResetPasswordPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/change-password', element: <ForcedChangePasswordPage /> },
      {
        element: <AppShell />,
        children: [
          { index: true, element: <HomeRedirect /> },
          { path: '/profile', lazy: page(() => import('@/features/profile/ProfilePage'), 'ProfilePage') },
          { path: '/announcements', lazy: page(() => import('@/features/announcements/AnnouncementsPage'), 'AnnouncementsPage') },
          { path: '/chat', lazy: page(() => import('@/features/chat/ChatPage'), 'ChatPage') },
          { path: '/chat/:courseId', lazy: page(() => import('@/features/chat/ChatPage'), 'ChatPage') },
          { path: '/courses/:courseId', lazy: page(() => import('@/features/courses/CoursePage'), 'CoursePage') },
          { path: '/assignments/:assignmentId', lazy: page(() => import('@/features/assignments/AssignmentPage'), 'AssignmentPage') },
          { path: '/quizzes/:quizId', lazy: page(() => import('@/features/quizzes/QuizPage'), 'QuizPage') },
          {
            element: <RequireRole roles={['student']} />,
            children: [
              { path: '/student', lazy: dashboard },
              { path: '/marks', lazy: page(() => import('@/features/marks/MyMarksPage'), 'MyMarksPage') },
              { path: '/quizzes/:quizId/take', lazy: page(() => import('@/features/quizzes/QuizRunnerPage'), 'QuizRunnerPage') },
            ],
          },
          {
            element: <RequireRole roles={['teacher']} />,
            children: [{ path: '/teacher', lazy: dashboard }],
          },
          {
            element: <RequireRole roles={['student', 'teacher']} />,
            children: [
              { path: '/courses', lazy: page(() => import('@/features/courses/MyCoursesPage'), 'MyCoursesPage') },
              { path: '/complaints', lazy: page(() => import('@/features/complaints/ComplaintsPages'), 'MyComplaintsPage') },
            ],
          },
          {
            element: <RequireRole roles={['teacher', 'admin']} />,
            children: [
              { path: '/courses/:courseId/quizzes/new', lazy: page(() => import('@/features/quizzes/QuizBuilderPage'), 'QuizBuilderPage') },
              { path: '/quizzes/:quizId/edit', lazy: page(() => import('@/features/quizzes/QuizBuilderPage'), 'QuizBuilderPage') },
            ],
          },
          {
            element: <RequireRole roles={['admin']} />,
            children: [
              { path: '/admin', lazy: dashboard },
              { path: '/admin/users', lazy: page(() => import('@/features/admin/UsersPage'), 'UsersPage') },
              { path: '/admin/courses', lazy: page(() => import('@/features/admin/CoursesAdminPage'), 'CoursesAdminPage') },
              { path: '/admin/courses/:courseId', lazy: page(() => import('@/features/admin/CourseAdminDetailPage'), 'CourseAdminDetailPage') },
              { path: '/admin/complaints', lazy: page(() => import('@/features/complaints/ComplaintsPages'), 'AdminComplaintsPage') },
              { path: '/admin/audit', lazy: page(() => import('@/features/admin/AuditLogPage'), 'AuditLogPage') },
            ],
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
  { path: '*', element: <NotFoundPage /> },
])
