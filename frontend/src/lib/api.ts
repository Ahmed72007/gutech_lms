import type { PageMeta, Session } from './types'

// Production serves the API from the same origin (/api); dev talks to the local API.
const API_URL = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '/api' : 'http://localhost:4000/api')).replace(/\/$/, '')

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string = 'UNKNOWN',
    readonly details?: Array<{ path: string; message: string }>,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

// --- Session (access token in memory only; refresh token is an httpOnly cookie) ---

type SessionListener = (session: Session | null) => void
type AuthEvent = { type: 'password-change-required' }

let current: Session | null = null
const sessionListeners = new Set<SessionListener>()
const eventListeners = new Set<(event: AuthEvent) => void>()

export const sessionStore = {
  get: () => current,
  token: () => current?.accessToken ?? null,
  set(session: Session | null) {
    current = session
    sessionListeners.forEach((listener) => listener(session))
  },
  subscribe(listener: SessionListener) {
    sessionListeners.add(listener)
    return () => sessionListeners.delete(listener)
  },
  onEvent(listener: (event: AuthEvent) => void) {
    eventListeners.add(listener)
    return () => eventListeners.delete(listener)
  },
}

let refreshing: Promise<Session | null> | null = null

/** Exchanges the refresh cookie for a new access token. Concurrent callers share one request. */
export function refreshSession(): Promise<Session | null> {
  refreshing ??= fetch(`${API_URL}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (response) => (response.ok ? ((await response.json()) as { data: Session }).data : null))
    .catch(() => null)
    .then((session) => {
      sessionStore.set(session)
      return session
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

// --- Requests ---

type Query = Record<string, string | number | boolean | null | undefined>

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  query?: Query
  body?: unknown
  form?: FormData
  signal?: AbortSignal
  /** Internal: prevents infinite refresh loops. */
  retried?: boolean
}

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_URL}${path}`
  if (!query) return url
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `${url}?${qs}` : url
}

const NO_REFRESH = ['/auth/login', '/auth/refresh', '/auth/reset-password', '/auth/forgot-password']

async function toApiError(response: Response): Promise<ApiError> {
  const payload = (await response.json().catch(() => ({}))) as {
    error?: { message?: string; code?: string; details?: Array<{ path: string; message: string }> }
  }
  const fallback = response.status >= 500 ? 'The server had a problem. Please try again.' : 'Something went wrong. Please try again.'
  return new ApiError(payload.error?.message ?? fallback, response.status, payload.error?.code, payload.error?.details)
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {}
  const token = sessionStore.token()
  if (token) headers.Authorization = `Bearer ${token}`
  if (options.body !== undefined) headers['Content-Type'] = 'application/json'

  let response: Response
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
    })
  } catch (error) {
    if ((error as Error).name === 'AbortError') throw error
    throw new ApiError('Cannot reach the server. Check your connection and try again.', 0, 'NETWORK_ERROR')
  }

  if (response.status === 401 && !options.retried && !NO_REFRESH.includes(path)) {
    const session = await refreshSession()
    if (session) return request<T>(path, { ...options, retried: true })
  }

  if (!response.ok) {
    const error = await toApiError(response)
    if (error.code === 'PASSWORD_CHANGE_REQUIRED') eventListeners.forEach((l) => l({ type: 'password-change-required' }))
    throw error
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

/** `{ data }` envelope unwrapped. */
export async function apiGet<T>(path: string, query?: Query, signal?: AbortSignal): Promise<T> {
  return (await request<{ data: T }>(path, { query, signal })).data
}

/** Paginated list: `{ data, meta }`. */
export async function apiPage<T, M = PageMeta>(path: string, query?: Query, signal?: AbortSignal): Promise<{ data: T[]; meta: M }> {
  return request<{ data: T[]; meta: M }>(path, { query, signal })
}

export async function apiSend<T>(method: 'POST' | 'PATCH' | 'PUT' | 'DELETE', path: string, body?: unknown, query?: Query): Promise<T> {
  const result = await request<{ data: T } | undefined>(path, { method, body, query })
  return result?.data as T
}

export async function apiForm<T>(method: 'POST' | 'PATCH' | 'PUT', path: string, form: FormData, query?: Query): Promise<T> {
  return (await request<{ data: T }>(path, { method, form, query })).data
}

/** Multipart upload with progress events (fetch has no upload progress). */
export function uploadWithProgress<T>(
  method: 'POST' | 'PUT' | 'PATCH',
  path: string,
  form: FormData,
  onProgress: (percent: number) => void,
  retried = false,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open(method, buildUrl(path))
    xhr.withCredentials = true
    const token = sessionStore.token()
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    xhr.onerror = () => reject(new ApiError('Upload failed. Check your connection and try again.', 0, 'NETWORK_ERROR'))
    xhr.onload = async () => {
      if (xhr.status === 401 && !retried && (await refreshSession())) {
        uploadWithProgress<T>(method, path, form, onProgress, true).then(resolve, reject)
        return
      }
      let payload: { data?: T; error?: { message?: string; code?: string; details?: Array<{ path: string; message: string }> } } = {}
      try {
        payload = JSON.parse(xhr.responseText || '{}')
      } catch {
        /* non-JSON response */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(payload.data as T)
      else if (xhr.status === 413)
        reject(new ApiError('This file is too large for the server to accept. Try a smaller file (under 4 MB).', 413, 'PAYLOAD_TOO_LARGE'))
      else reject(new ApiError(payload.error?.message ?? 'Upload failed.', xhr.status, payload.error?.code, payload.error?.details))
    }
    xhr.send(form)
  })
}

/** Fetches a short-lived signed URL from the API and starts the download. */
export async function downloadSigned(path: string): Promise<void> {
  const { url } = await apiGet<{ url: string }>(path)
  const link = document.createElement('a')
  link.href = url
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

/** Downloads an authenticated binary endpoint (e.g. CSV export). */
export async function downloadBlob(path: string, fallbackName: string): Promise<void> {
  const send = () =>
    fetch(buildUrl(path), {
      credentials: 'include',
      headers: sessionStore.token() ? { Authorization: `Bearer ${sessionStore.token()}` } : {},
    })
  let response = await send()
  if (response.status === 401 && (await refreshSession())) response = await send()
  if (!response.ok) throw await toApiError(response)
  const name = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') ?? '')?.[1] ?? fallbackName
  const url = URL.createObjectURL(await response.blob())
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message
  if (error instanceof Error) return error.message
  return 'Something went wrong. Please try again.'
}
