import { adminDb } from '../config/supabase.js'
import { logger } from '../config/logger.js'

export const BUCKETS = {
  resources: 'resources',
  submissions: 'submissions',
  complaints: 'complaint-attachments',
  avatars: 'avatars',
} as const

export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS]

/** Signed download links live for 60 seconds. */
export const SIGNED_URL_TTL_SECONDS = 60

export async function upload(bucket: Bucket, path: string, body: Buffer, contentType: string): Promise<void> {
  const { error } = await adminDb.storage.from(bucket).upload(path, body, { contentType, upsert: false })
  if (error) throw error
}

export async function signedUrl(bucket: Bucket, path: string, options: { downloadName?: string; ttl?: number } = {}): Promise<string> {
  const { data, error } = await adminDb.storage
    .from(bucket)
    .createSignedUrl(path, options.ttl ?? SIGNED_URL_TTL_SECONDS, options.downloadName ? { download: options.downloadName } : undefined)
  if (error || !data) throw error ?? new Error('Could not sign URL')
  return data.signedUrl
}

/** Best effort: an orphaned object is preferable to failing the user's request. */
export async function remove(bucket: Bucket, paths: Array<string | null | undefined>): Promise<void> {
  const keys = paths.filter((p): p is string => Boolean(p))
  if (keys.length === 0) return
  const { error } = await adminDb.storage.from(bucket).remove(keys)
  if (error) logger.warn({ err: error, bucket, count: keys.length }, 'Failed to remove storage objects')
}
