import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPage, apiSend, errorMessage, uploadWithProgress } from '@/lib/api'
import type { Assignment, Course, CourseDetail, Dashboard, Member, Quiz, Resource } from '@/lib/types'

export const courseKeys = {
  mine: ['courses', 'mine'] as const,
  detail: (id: string) => ['courses', id] as const,
  members: (id: string) => ['courses', id, 'members'] as const,
  resources: (id: string, page: number, search: string) => ['courses', id, 'resources', page, search] as const,
  assignments: (id: string, page: number) => ['courses', id, 'assignments', page] as const,
  quizzes: (id: string, page: number) => ['courses', id, 'quizzes', page] as const,
}

export function useDashboard() {
  return useQuery({ queryKey: ['dashboard'], queryFn: () => apiGet<Dashboard>('/me/dashboard') })
}

export function useMyCourses(enabled = true) {
  return useQuery({ queryKey: courseKeys.mine, queryFn: () => apiGet<Course[]>('/me/courses'), enabled })
}

export function useCourse(id: string) {
  return useQuery({ queryKey: courseKeys.detail(id), queryFn: () => apiGet<CourseDetail>(`/courses/${id}`) })
}

export function useMembers(id: string) {
  return useQuery({ queryKey: courseKeys.members(id), queryFn: () => apiGet<Member[]>(`/courses/${id}/members`) })
}

// Resources ---------------------------------------------------------------------
export function useResources(courseId: string, page: number, search: string) {
  return useQuery({
    queryKey: courseKeys.resources(courseId, page, search),
    queryFn: () => apiPage<Resource>(`/courses/${courseId}/resources`, { page, pageSize: 12, search }),
    placeholderData: keepPreviousData,
  })
}

export function useUploadResource(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ form, onProgress }: { form: FormData; onProgress: (p: number) => void }) =>
      uploadWithProgress<Resource>('POST', `/courses/${courseId}/resources`, form, onProgress),
    onSuccess: () => {
      toast.success('Resource uploaded')
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'resources'] })
    },
  })
}

export function useDeleteResource(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/resources/${id}`),
    onSuccess: () => {
      toast.success('Resource deleted')
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'resources'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// Assignments & quizzes lists ---------------------------------------------------------
export function useCourseAssignments(courseId: string, page: number) {
  return useQuery({
    queryKey: courseKeys.assignments(courseId, page),
    queryFn: () => apiPage<Assignment>(`/courses/${courseId}/assignments`, { page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  })
}

export function useCourseQuizzes(courseId: string, page: number) {
  return useQuery({
    queryKey: courseKeys.quizzes(courseId, page),
    queryFn: () => apiPage<Quiz>(`/courses/${courseId}/quizzes`, { page, pageSize: 20 }),
    placeholderData: keepPreviousData,
  })
}
