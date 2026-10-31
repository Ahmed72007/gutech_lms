import type { z } from 'zod'
import * as profileRepository from '../repositories/profile.repository.js'
import * as storage from '../repositories/storage.repository.js'
import type { updateOwnProfileSchema } from '../schemas/user.schema.js'
import type { Profile, RequestContext, UploadedFile } from '../types/domain.js'
import { FILE_POLICIES, inspectFile } from '../utils/files.js'
import { randomUUID } from 'node:crypto'

/** Avatars are shown on every page, so their signed URL lives for an hour. */
const AVATAR_URL_TTL_SECONDS = 60 * 60

export async function toPublicProfile(profile: Profile) {
  const avatarUrl = profile.avatarPath
    ? await storage.signedUrl(storage.BUCKETS.avatars, profile.avatarPath, { ttl: AVATAR_URL_TTL_SECONDS }).catch(() => null)
    : null
  return {
    id: profile.id,
    fullName: profile.fullName,
    email: profile.email,
    role: profile.role,
    rollNo: profile.rollNo,
    phone: profile.phone,
    bio: profile.bio,
    avatarUrl,
    isActive: profile.isActive,
    mustChangePassword: profile.mustChangePassword,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
  }
}

export async function getOwnProfile(ctx: RequestContext) {
  return toPublicProfile(ctx.user)
}

export async function updateOwnProfile(ctx: RequestContext, input: z.infer<typeof updateOwnProfileSchema>) {
  const updated = await profileRepository.updateOwn(ctx.db, ctx.user.id, input)
  return toPublicProfile(updated)
}

export async function uploadAvatar(ctx: RequestContext, file: UploadedFile) {
  const { mime, ext } = await inspectFile(file, FILE_POLICIES.avatar)
  const path = `${ctx.user.id}/${randomUUID()}.${ext}`
  await storage.upload(storage.BUCKETS.avatars, path, file.buffer, mime)

  try {
    const updated = await profileRepository.updateOwn(ctx.db, ctx.user.id, { avatarPath: path })
    await storage.remove(storage.BUCKETS.avatars, [ctx.user.avatarPath])
    return toPublicProfile(updated)
  } catch (error) {
    await storage.remove(storage.BUCKETS.avatars, [path])
    throw error
  }
}

export async function removeAvatar(ctx: RequestContext) {
  const updated = await profileRepository.updateOwn(ctx.db, ctx.user.id, { avatarPath: null })
  await storage.remove(storage.BUCKETS.avatars, [ctx.user.avatarPath])
  return toPublicProfile(updated)
}
