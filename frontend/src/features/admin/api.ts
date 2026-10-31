import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiForm, apiGet, apiPage, apiSend, errorMessage } from '@/lib/api'
import type { AdminUser, AuditEntry, Complaint, ComplaintCategory, ComplaintStatus, Course, EnrollmentReport, Role, RosterStudent } from '@/lib/types'

// Users ---------------------------------------------------------------------------
export interface UserFilters {
  page: number
  search: string
  role: Role | ''
  status: 'active' | 'inactive' | ''
}

export function useUsers(filters: UserFilters, pageSize = 20) {
  return useQuery({
    queryKey: ['admin', 'users', filters, pageSize],
    queryFn: () => apiPage<AdminUser>('/admin/users', { ...filters, pageSize }),
    placeholderData: keepPreviousData,
  })
}

export function useCreateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { fullName: string; email: string; role: Role; tempPassword: string; rollNo?: string }) =>
      apiSend<AdminUser>('POST', '/admin/users', input),
    onSuccess: (user) => {
      toast.success(`${user.fullName} can now sign in`)
      void qc.invalidateQueries({ queryKey: ['admin', 'users'] })
    },
  })
}

export function useUpdateUser() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...patch }: { id: string; fullName?: string; role?: Role; isActive?: boolean; rollNo?: string | null }) =>
      apiSend<AdminUser>('PATCH', `/admin/users/${id}`, patch),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'users'] }),
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useResetUserPassword() {
  return useMutation({
    mutationFn: ({ id, mode, tempPassword }: { id: string; mode: 'email' | 'temp'; tempPassword?: string }) =>
      apiSend<{ message: string }>('POST', `/admin/users/${id}/reset-password`, { mode, tempPassword }),
    onSuccess: (r) => toast.success(r.message),
  })
}

// Courses ---------------------------------------------------------------------------
export function useAdminCourses(params: { page: number; search: string; archived: 'true' | 'false' | 'all' }, pageSize = 12, enabled = true) {
  return useQuery({
    queryKey: ['admin', 'courses', params, pageSize],
    enabled,
    queryFn: () => apiPage<Course>('/admin/courses', { ...params, pageSize }),
    placeholderData: keepPreviousData,
  })
}

export function useAdminCourse(id: string) {
  return useQuery({ queryKey: ['admin', 'course', id], queryFn: () => apiGet<Course>(`/admin/courses/${id}`) })
}

export function useSaveCourse(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { code?: string; title?: string; description?: string | null; isArchived?: boolean }) =>
      id ? apiSend<Course>('PATCH', `/admin/courses/${id}`, input) : apiSend<Course>('POST', '/admin/courses', input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
      if (id) void qc.invalidateQueries({ queryKey: ['admin', 'course', id] })
    },
  })
}

export function useSetTeachers(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (teacherIds: string[]) => apiSend<Course>('PUT', `/admin/courses/${courseId}/teachers`, { teacherIds }),
    onSuccess: () => {
      toast.success('Teachers updated')
      void qc.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
      void qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useRoster(courseId: string, page: number, search: string) {
  return useQuery({
    queryKey: ['admin', 'course', courseId, 'roster', page, search],
    queryFn: () => apiPage<RosterStudent>(`/admin/courses/${courseId}/enrollments`, { page, pageSize: 20, search }),
    placeholderData: keepPreviousData,
  })
}

export function useEnroll(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ studentIds, csv, dryRun }: { studentIds?: string[]; csv?: File; dryRun: boolean }) => {
      if (csv) {
        const form = new FormData()
        form.append('file', csv)
        return apiForm<EnrollmentReport>('POST', `/admin/courses/${courseId}/enrollments`, form, { dryRun })
      }
      return apiSend<EnrollmentReport>('POST', `/admin/courses/${courseId}/enrollments`, { studentIds }, { dryRun })
    },
    onSuccess: (report) => {
      if (!report.dryRun) {
        void qc.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
        void qc.invalidateQueries({ queryKey: ['admin', 'courses'] })
      }
    },
  })
}

export function useUnenroll(courseId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (studentId: string) => apiSend('DELETE', `/admin/courses/${courseId}/enrollments/${studentId}`),
    onSuccess: () => {
      toast.success('Student removed from course')
      void qc.invalidateQueries({ queryKey: ['admin', 'course', courseId] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

// Complaints ------------------------------------------------------------------------
export function useAdminComplaints(params: { page: number; status: ComplaintStatus | ''; category: ComplaintCategory | ''; search: string }) {
  return useQuery({
    queryKey: ['complaints', 'admin', params],
    queryFn: () => apiPage<Complaint>('/admin/complaints', { ...params, pageSize: 20 }),
    placeholderData: keepPreviousData,
  })
}

export function useUpdateComplaint() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, status, adminResponse }: { id: string; status: ComplaintStatus; adminResponse?: string }) =>
      apiSend<Complaint>('PATCH', `/admin/complaints/${id}`, { status, adminResponse }),
    onSuccess: () => {
      toast.success('Complaint updated')
      void qc.invalidateQueries({ queryKey: ['complaints'] })
      void qc.invalidateQueries({ queryKey: ['dashboard'] })
    },
  })
}

// Audit -----------------------------------------------------------------------------
export function useAuditLog(page: number, entity: string) {
  return useQuery({
    queryKey: ['admin', 'audit', page, entity],
    queryFn: () => apiPage<AuditEntry>('/admin/audit-log', { page, pageSize: 25, entity }),
    placeholderData: keepPreviousData,
  })
}
