import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiGet, apiPage, apiSend, errorMessage, uploadWithProgress } from '@/lib/api'
import type { Assignment, AssignmentDetail, Submission, SubmissionRow } from '@/lib/types'

export const assignmentKeys = {
  detail: (id: string) => ['assignments', id] as const,
  submissions: (id: string, page: number) => ['assignments', id, 'submissions', page] as const,
}

export function useAssignment(id: string) {
  return useQuery({ queryKey: assignmentKeys.detail(id), queryFn: () => apiGet<AssignmentDetail>(`/assignments/${id}`) })
}

export function useSubmissions(id: string, page: number, enabled: boolean) {
  return useQuery({
    queryKey: assignmentKeys.submissions(id, page),
    queryFn: () => apiPage<SubmissionRow>(`/assignments/${id}/submissions`, { page, pageSize: 50 }),
    enabled,
    placeholderData: keepPreviousData,
  })
}

/** Create (POST to course) or update (PATCH) an assignment; multipart for the optional attachment. */
export function useSaveAssignment(courseId: string, assignmentId?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ form, onProgress }: { form: FormData; onProgress: (p: number) => void }) =>
      assignmentId
        ? uploadWithProgress<Assignment>('PATCH', `/assignments/${assignmentId}`, form, onProgress)
        : uploadWithProgress<Assignment>('POST', `/courses/${courseId}/assignments`, form, onProgress),
    onSuccess: () => {
      toast.success(assignmentId ? 'Assignment updated' : 'Assignment created')
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'assignments'] })
      if (assignmentId) void qc.invalidateQueries({ queryKey: assignmentKeys.detail(assignmentId) })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useDeleteAssignment(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/assignments/${id}`),
    onSuccess: () => {
      toast.success('Assignment deleted')
      void qc.invalidateQueries({ queryKey: ['courses', courseId, 'assignments'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useSubmit(assignmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ form, onProgress }: { form: FormData; onProgress: (p: number) => void }) =>
      uploadWithProgress<Submission>('PUT', `/assignments/${assignmentId}/submission`, form, onProgress),
    onSuccess: (submission) => {
      toast.success(submission.isLate ? 'Submitted (marked late)' : 'Submission saved')
      void qc.invalidateQueries({ queryKey: assignmentKeys.detail(assignmentId) })
      void qc.invalidateQueries({ queryKey: ['courses'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

export function useGrade(assignmentId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ submissionId, marks, feedback }: { submissionId: string; marks: number; feedback: string }) =>
      apiSend<Submission>('PATCH', `/submissions/${submissionId}/grade`, { marks, feedback }),
    onSuccess: () => {
      toast.success('Grade saved')
      void qc.invalidateQueries({ queryKey: ['assignments', assignmentId] })
      void qc.invalidateQueries({ queryKey: ['gradebook'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}
