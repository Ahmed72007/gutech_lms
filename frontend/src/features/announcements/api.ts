import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { apiPage, apiSend, errorMessage } from '@/lib/api'
import type { Announcement } from '@/lib/types'

export function useAnnouncements(params: { page?: number; pageSize?: number; courseId?: string; scope?: 'all' | 'global' }) {
  return useQuery({
    queryKey: ['announcements', 'feed', params],
    queryFn: () => apiPage<Announcement>('/announcements', { page: params.page ?? 1, pageSize: params.pageSize ?? 15, courseId: params.courseId, scope: params.scope }),
    placeholderData: keepPreviousData,
  })
}

export function useSaveAnnouncement(id?: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: { courseId?: string | null; title: string; body: string; isPinned: boolean }) =>
      id
        ? apiSend<Announcement>('PATCH', `/announcements/${id}`, { title: input.title, body: input.body, isPinned: input.isPinned })
        : apiSend<Announcement>('POST', '/announcements', input),
    onSuccess: () => {
      toast.success(id ? 'Announcement updated' : 'Announcement posted')
      void qc.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => apiSend('DELETE', `/announcements/${id}`),
    onSuccess: () => {
      toast.success('Announcement deleted')
      void qc.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (e) => toast.error(errorMessage(e)),
  })
}

export function useMarkAnnouncementsRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => apiSend<{ marked: number }>('POST', '/announcements/read', {}),
    onSuccess: (r) => {
      if (r.marked > 0) void qc.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}
