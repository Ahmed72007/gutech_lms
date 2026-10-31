import { ArrowDown, ArrowLeft, Loader2, MessageCircle, MoreVertical, RotateCw, Search, SendHorizontal, Trash2, WifiOff } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { RoleBadge } from '@/components/shared'
import { Button } from '@/components/ui/button'
import { Input, Textarea } from '@/components/ui/input'
import { Avatar, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Skeleton } from '@/components/ui/primitives'
import { EmptyState, ErrorState } from '@/components/ui/states'
import { useAdminCourses } from '@/features/admin/api'
import { useUser } from '@/features/auth/AuthProvider'
import { courseCover } from '@/features/courses/CourseCard'
import { useMembers, useMyCourses } from '@/features/courses/api'
import { apiPage, apiSend, errorMessage } from '@/lib/api'
import { realtime, realtimeEnabled } from '@/lib/supabase'
import type { ChatMessage, CourseRef, Profile } from '@/lib/types'
import { cn, formatDateTime } from '@/lib/utils'

const PAGE = 50
const DELETE_WINDOW_MS = 5 * 60 * 1000

type LocalMessage = ChatMessage & { localStatus?: 'sending' | 'failed'; tempId?: string }

interface Row {
  id: string
  course_id: string
  sender_id: string
  body: string
  created_at: string
  deleted_at: string | null
}

function fromRow(row: Row, sender: ChatMessage['sender']): ChatMessage {
  return {
    id: row.id,
    courseId: row.course_id,
    senderId: row.sender_id,
    body: row.deleted_at ? null : row.body,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
    sender,
  }
}

function useChatCourses() {
  const user = useUser()
  const mine = useMyCourses(user.role !== 'admin')
  const all = useAdminCourses({ page: 1, search: '', archived: 'false' }, 100, user.role === 'admin')
  const query = user.role === 'admin' ? all : mine
  const courses: CourseRef[] | undefined = (user.role === 'admin' ? all.data?.data : mine.data)?.map((c) => ({ id: c.id, code: c.code, title: c.title }))
  return { courses, isPending: query.isPending, isError: query.isError, error: query.error, refetch: query.refetch }
}

export function ChatPage() {
  const { courseId } = useParams()
  const { courses, isPending, isError, error, refetch } = useChatCourses()
  const [search, setSearch] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    // On desktop, open the first conversation automatically.
    if (!courseId && courses?.length && window.matchMedia('(min-width: 1024px)').matches) {
      navigate(`/chat/${courses[0]?.id}`, { replace: true })
    }
  }, [courseId, courses, navigate])

  const visible = (courses ?? []).filter((c) => `${c.code} ${c.title}`.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div className="-mx-4 -mt-6 flex h-[calc(100dvh-4rem-4.5rem)] overflow-hidden border-y bg-card sm:-mx-6 sm:-mt-8 lg:mx-0 lg:mt-0 lg:h-[calc(100dvh-8rem)] lg:rounded-2xl lg:border lg:shadow-soft">
      <aside className={cn('flex w-full flex-col border-r lg:w-80', courseId && 'hidden lg:flex')}>
        <div className="border-b p-4">
          <h1 className="mb-3 font-display text-xl font-bold">Classroom chat</h1>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search courses" className="pl-9" aria-label="Search courses" />
          </div>
        </div>
        <div className="scrollbar-thin flex-1 overflow-y-auto p-2">
          {isPending ? (
            <div className="space-y-2 p-2">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-14" />
              ))}
            </div>
          ) : isError ? (
            <ErrorState error={error} onRetry={() => void refetch()} className="m-2" />
          ) : visible.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">No course chats available.</p>
          ) : (
            <ul className="space-y-1">
              {visible.map((c) => (
                <li key={c.id}>
                  <Link
                    to={`/chat/${c.id}`}
                    className={cn('flex items-center gap-3 rounded-xl p-2.5 transition', c.id === courseId ? 'bg-primary-soft' : 'hover:bg-muted')}
                    aria-current={c.id === courseId ? 'page' : undefined}
                  >
                    <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xs font-bold text-white', courseCover(c.code))}>
                      {c.code.slice(0, 4)}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">{c.code}</span>
                      <span className="block truncate text-xs text-muted-foreground">{c.title}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
      <section className={cn('min-w-0 flex-1 flex-col', courseId ? 'flex' : 'hidden lg:flex')}>
        {courseId ? (
          <Conversation key={courseId} courseId={courseId} course={courses?.find((c) => c.id === courseId)} />
        ) : (
          <div className="grid flex-1 place-items-center p-6">
            <EmptyState icon={MessageCircle} title="Pick a class" description="Choose a course on the left to open its group chat." />
          </div>
        )}
      </section>
    </div>
  )
}

function Conversation({ courseId, course }: { courseId: string; course?: CourseRef }) {
  const user = useUser()
  const members = useMembers(courseId)
  const [messages, setMessages] = useState<LocalMessage[]>([])
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [loadError, setLoadError] = useState<unknown>(null)
  const [hasMore, setHasMore] = useState(false)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [draft, setDraft] = useState('')
  const [atBottom, setAtBottom] = useState(true)
  const [unseen, setUnseen] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const preserveScroll = useRef<number | null>(null)

  const memberMap = useMemo(() => new Map((members.data ?? []).map((m) => [m.id, { id: m.id, fullName: m.fullName, role: m.role }])), [members.data])
  const canPost = user.role !== 'admin'

  const senderFor = useCallback(
    (id: string): ChatMessage['sender'] => (id === user.id ? { id, fullName: user.fullName, role: user.role } : (memberMap.get(id) ?? null)),
    [memberMap, user],
  )

  const loadInitial = useCallback(async () => {
    setStatus('loading')
    try {
      const page = await apiPage<ChatMessage, { hasMore: boolean }>(`/courses/${courseId}/messages`, { limit: PAGE })
      setMessages(page.data.slice().reverse())
      setHasMore(page.meta.hasMore)
      setStatus('ready')
    } catch (e) {
      setLoadError(e)
      setStatus('error')
    }
  }, [courseId])

  useEffect(() => {
    void loadInitial()
  }, [loadInitial])

  // Realtime subscription; RLS on chat_messages limits it to course members.
  useEffect(() => {
    if (!realtime) return
    const channel = realtime
      .channel(`chat:${courseId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${courseId}` }, (payload) => {
        const row = payload.new as Row
        setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, fromRow(row, senderFor(row.sender_id))]))
        if (row.sender_id !== user.id) setUnseen((n) => n + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'chat_messages', filter: `course_id=eq.${courseId}` }, (payload) => {
        const row = payload.new as Row
        setMessages((prev) => prev.map((m) => (m.id === row.id ? { ...m, body: row.deleted_at ? null : row.body, deletedAt: row.deleted_at } : m)))
      })
      .subscribe()
    return () => {
      void realtime?.removeChannel(channel)
    }
  }, [courseId, senderFor, user.id])

  // Without Realtime configured, poll for new messages.
  useEffect(() => {
    if (realtimeEnabled || status !== 'ready') return
    const id = setInterval(async () => {
      try {
        const page = await apiPage<ChatMessage, { hasMore: boolean }>(`/courses/${courseId}/messages`, { limit: 20 })
        setMessages((prev) => {
          const known = new Map(prev.map((m) => [m.id, m]))
          for (const m of page.data) known.set(m.id, { ...known.get(m.id), ...m })
          return [...known.values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        })
      } catch {
        /* keep the current view */
      }
    }, 5000)
    return () => clearInterval(id)
  }, [courseId, status])

  // Fill in sender names once the member list arrives.
  useEffect(() => {
    if (memberMap.size === 0) return
    setMessages((prev) => prev.map((m) => (m.sender ? m : { ...m, sender: senderFor(m.senderId) })))
  }, [memberMap, senderFor])

  // Stick to the bottom when the user is already there; keep position when loading older.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return
    if (preserveScroll.current !== null) {
      el.scrollTop = el.scrollHeight - preserveScroll.current
      preserveScroll.current = null
    } else if (atBottom) {
      el.scrollTop = el.scrollHeight
      setUnseen(0)
    }
  }, [messages, atBottom])

  async function loadOlder() {
    const oldest = messages.find((m) => !m.localStatus)
    if (!oldest || loadingOlder) return
    setLoadingOlder(true)
    try {
      const page = await apiPage<ChatMessage, { hasMore: boolean }>(`/courses/${courseId}/messages`, { limit: PAGE, before: oldest.createdAt })
      preserveScroll.current = (scrollRef.current?.scrollHeight ?? 0) - (scrollRef.current?.scrollTop ?? 0)
      setMessages((prev) => [...page.data.slice().reverse().filter((m) => !prev.some((p) => p.id === m.id)), ...prev])
      setHasMore(page.meta.hasMore)
    } catch (e) {
      toast.error(errorMessage(e))
    } finally {
      setLoadingOlder(false)
    }
  }

  function onScroll() {
    const el = scrollRef.current
    if (!el) return
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    setAtBottom(bottom)
    if (bottom) setUnseen(0)
    if (el.scrollTop < 120 && hasMore && !loadingOlder) void loadOlder()
  }

  async function send(body: string, tempId: string = crypto.randomUUID()) {
    const optimistic: LocalMessage = {
      id: tempId,
      tempId,
      courseId,
      senderId: user.id,
      body,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      sender: { id: user.id, fullName: user.fullName, role: user.role },
      localStatus: 'sending',
    }
    setMessages((prev) => [...prev.filter((m) => m.id !== tempId), optimistic])
    setAtBottom(true)
    try {
      const saved = await apiSend<ChatMessage>('POST', `/courses/${courseId}/messages`, { body })
      // Realtime may have delivered the row already; drop the duplicate.
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId)
        return withoutTemp.some((m) => m.id === saved.id) ? withoutTemp : [...withoutTemp, saved]
      })
    } catch (e) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, localStatus: 'failed' } : m)))
      toast.error(errorMessage(e))
    }
  }

  function submit(e?: React.FormEvent) {
    e?.preventDefault()
    const body = draft.trim()
    if (!body || body.length > 2000) return
    setDraft('')
    void send(body)
  }

  async function remove(message: ChatMessage) {
    try {
      await apiSend('DELETE', `/messages/${message.id}`)
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, body: null, deletedAt: new Date().toISOString() } : m)))
    } catch (e) {
      toast.error(errorMessage(e))
    }
  }

  const isModerator = user.role === 'admin' || (user.role === 'teacher' && (members.data ?? []).some((m) => m.id === user.id && m.role === 'teacher'))

  return (
    <>
      <header className="flex items-center gap-3 border-b px-3 py-3 sm:px-5">
        <Button asChild variant="ghost" size="icon" className="lg:hidden">
          <Link to="/chat" aria-label="Back to chats">
            <ArrowLeft />
          </Link>
        </Button>
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-[11px] font-bold text-white', courseCover(course?.code ?? 'XX'))}>
          {course?.code.slice(0, 4)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display font-semibold">{course ? `${course.code} · ${course.title}` : 'Class chat'}</p>
          <p className="text-xs text-muted-foreground">
            {members.data ? `${members.data.length} members` : ' '}
            {!realtimeEnabled && (
              <span className="ml-2 inline-flex items-center gap-1 text-warning">
                <WifiOff className="size-3" /> live updates off
              </span>
            )}
          </p>
        </div>
        <Button asChild variant="outline" size="sm" className="hidden sm:inline-flex">
          <Link to={`/courses/${courseId}`}>Open course</Link>
        </Button>
      </header>

      <div ref={scrollRef} onScroll={onScroll} className="scrollbar-thin relative flex-1 overflow-y-auto bg-muted/20 px-3 py-4 sm:px-5" aria-live="polite">
        {status === 'loading' ? (
          <div className="space-y-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className={cn('h-14 w-2/3', i % 2 && 'ml-auto')} />
            ))}
          </div>
        ) : status === 'error' ? (
          <ErrorState error={loadError} onRetry={() => void loadInitial()} />
        ) : messages.length === 0 ? (
          <div className="grid h-full place-items-center">
            <EmptyState icon={MessageCircle} title="Say hello 👋" description="No messages yet. Start the conversation with your class." />
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="mb-4 flex justify-center">
                <Button variant="ghost" size="sm" onClick={() => void loadOlder()} loading={loadingOlder}>
                  Load earlier messages
                </Button>
              </div>
            )}
            <ol className="space-y-1">
              {messages.map((m, i) => {
                const prev = messages[i - 1]
                const grouped = prev && prev.senderId === m.senderId && new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000
                const mine = m.senderId === user.id
                return (
                  <MessageBubble
                    key={m.tempId ?? m.id}
                    message={m}
                    mine={mine}
                    grouped={Boolean(grouped)}
                    canDelete={!m.localStatus && !m.deletedAt && (isModerator || (mine && Date.now() - new Date(m.createdAt).getTime() < DELETE_WINDOW_MS))}
                    onDelete={() => void remove(m)}
                    onRetry={() => m.body && void send(m.body, m.id)}
                    user={user}
                  />
                )
              })}
            </ol>
          </>
        )}
        {!atBottom && unseen > 0 && (
          <button
            onClick={() => {
              setAtBottom(true)
              scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
            }}
            className="sticky bottom-2 left-1/2 mx-auto flex -translate-x-0 items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow-lift"
          >
            <ArrowDown className="size-3.5" /> {unseen} new
          </button>
        )}
      </div>

      {canPost ? (
        <form onSubmit={submit} className="flex items-end gap-2 border-t bg-card p-3 sm:p-4">
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Message your class…"
            aria-label="Message"
            className="max-h-36 min-h-11 resize-none"
          />
          <Button type="submit" size="icon" className="size-11 shrink-0" disabled={!draft.trim()} aria-label="Send message">
            <SendHorizontal />
          </Button>
        </form>
      ) : (
        <p className="border-t bg-muted/40 p-3 text-center text-xs text-muted-foreground">Admins can read class chats but not post.</p>
      )}
    </>
  )
}

function MessageBubble({
  message: m,
  mine,
  grouped,
  canDelete,
  onDelete,
  onRetry,
  user,
}: {
  message: LocalMessage
  mine: boolean
  grouped: boolean
  canDelete: boolean
  onDelete: () => void
  onRetry: () => void
  user: Profile
}) {
  const name = m.sender?.fullName ?? (mine ? user.fullName : 'Member')
  return (
    <li className={cn('group flex gap-2', mine ? 'flex-row-reverse' : 'flex-row', !grouped && 'pt-3')}>
      <div className="w-8 shrink-0">{!grouped && !mine && <Avatar name={name} className="size-8" />}</div>
      <div className={cn('flex max-w-[80%] flex-col sm:max-w-[65%]', mine ? 'items-end' : 'items-start')}>
        {!grouped && (
          <div className={cn('mb-1 flex items-center gap-2 px-1 text-xs', mine && 'flex-row-reverse')}>
            <span className="font-semibold">{mine ? 'You' : name}</span>
            {m.sender && m.sender.role !== 'student' && <RoleBadge role={m.sender.role} />}
            <time className="text-muted-foreground" dateTime={m.createdAt}>
              {formatDateTime(m.createdAt)}
            </time>
          </div>
        )}
        <div className={cn('flex items-center gap-1', mine && 'flex-row-reverse')}>
          {m.deletedAt ? (
            <p className="rounded-2xl border border-dashed px-3.5 py-2 text-sm italic text-muted-foreground">Message deleted</p>
          ) : (
            // Plain text only: React escapes the body, so HTML is never interpreted.
            <p
              className={cn(
                'whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm leading-relaxed shadow-sm',
                mine ? 'rounded-br-md bg-primary text-primary-foreground' : 'rounded-bl-md border bg-card',
                m.localStatus === 'sending' && 'opacity-70',
                m.localStatus === 'failed' && 'bg-danger-soft text-danger',
              )}
            >
              {m.body}
            </p>
          )}
          {canDelete && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="opacity-0 transition group-hover:opacity-100 focus:opacity-100" aria-label="Message actions">
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align={mine ? 'end' : 'start'}>
                <DropdownMenuItem onSelect={onDelete} className="text-danger focus:text-danger">
                  <Trash2 className="!text-danger" /> Delete message
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {m.localStatus === 'sending' && (
          <span className="mt-0.5 flex items-center gap-1 px-1 text-[11px] text-muted-foreground">
            <Loader2 className="size-3 animate-spin" /> Sending
          </span>
        )}
        {m.localStatus === 'failed' && (
          <button onClick={onRetry} className="mt-0.5 flex items-center gap-1 px-1 text-[11px] font-semibold text-danger hover:underline">
            <RotateCw className="size-3" /> Not sent · Retry
          </button>
        )}
      </div>
    </li>
  )
}
