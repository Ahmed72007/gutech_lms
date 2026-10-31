import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { apiGet, apiPage, apiSend } from '@/lib/api'
import { realtime, realtimeEnabled } from '@/lib/supabase'
import type { Announcement, Notification } from '@/lib/types'

export const badgeKeys = {
  announcements: ['announcements', 'unread-count'] as const,
  notifications: ['notifications', 'unread-count'] as const,
}

/** Unread counts for the navbar, kept live by Realtime (falls back to polling). */
export function useUnreadCounts(userId: string) {
  const qc = useQueryClient()
  const interval = realtimeEnabled ? 120_000 : 30_000

  const announcements = useQuery({
    queryKey: badgeKeys.announcements,
    queryFn: () => apiGet<{ count: number }>('/announcements/unread-count'),
    refetchInterval: interval,
  })
  const notifications = useQuery({
    queryKey: badgeKeys.notifications,
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count'),
    refetchInterval: interval,
  })

  useEffect(() => {
    if (!realtime) return
    const channel = realtime
      .channel(`badges:${userId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'announcements' }, () => {
        void qc.invalidateQueries({ queryKey: ['announcements'] })
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => {
        void qc.invalidateQueries({ queryKey: ['notifications'] })
        void qc.invalidateQueries({ queryKey: ['complaints'] })
      })
      .subscribe()
    return () => {
      void realtime?.removeChannel(channel)
    }
  }, [qc, userId])

  return {
    announcements: announcements.data?.count ?? 0,
    notifications: notifications.data?.count ?? 0,
  }
}

export function useRecentActivity(enabled: boolean) {
  return useQuery({
    queryKey: ['notifications', 'recent'],
    enabled,
    queryFn: async () => {
      const [notices, announcements] = await Promise.all([
        apiPage<Notification>('/notifications', { pageSize: 8 }),
        apiPage<Announcement>('/announcements', { pageSize: 5 }),
      ])
      return { notices: notices.data, announcements: announcements.data }
    },
  })
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      await Promise.all([apiSend('POST', '/notifications/read', {}), apiSend('POST', '/announcements/read', {})])
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['notifications'] })
      void qc.invalidateQueries({ queryKey: ['announcements'] })
    },
  })
}
