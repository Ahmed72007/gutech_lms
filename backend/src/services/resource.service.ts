import type { z } from 'zod'
import * as auditRepository from '../repositories/audit.repository.js'
import * as resourceRepository from '../repositories/resource.repository.js'
import * as storage from '../repositories/storage.repository.js'
import type { createResourceSchema, listResourcesQuery } from '../schemas/resource.schema.js'
import type { RequestContext, UploadedFile } from '../types/domain.js'
import { FILE_POLICIES, inspectFile, sanitizeFileName, storagePath } from '../utils/files.js'
import { errors } from '../utils/http.js'
import { pageMeta } from '../utils/pagination.js'
import { assertCanManage, assertCanView } from './access.service.js'

/** Strip internal storage paths before anything leaves the API. */
function present(resource: resourceRepository.Resource) {
  const { filePath: _filePath, ...rest } = resource
  return rest
}

export async function upload(ctx: RequestContext, courseId: string, input: z.infer<typeof createResourceSchema>, file: UploadedFile | null) {
  await assertCanManage(ctx.user, courseId)
  if (!file) throw errors.unprocessable('Choose a file to upload.')
  const { mime } = await inspectFile(file, FILE_POLICIES.document)

  const fileName = sanitizeFileName(file.originalName)
  const path = storagePath(courseId, fileName) // resources/{course_id}/{uuid}-{filename}
  await storage.upload(storage.BUCKETS.resources, path, file.buffer, mime)

  try {
    const resource = await resourceRepository.insert({
      courseId,
      uploadedBy: ctx.user.id,
      title: input.title,
      description: input.description ?? null,
      filePath: path,
      fileName,
      mimeType: mime,
      sizeBytes: file.size,
    })
    return present(resource)
  } catch (error) {
    await storage.remove(storage.BUCKETS.resources, [path])
    throw error
  }
}

export async function list(ctx: RequestContext, courseId: string, query: z.infer<typeof listResourcesQuery>) {
  await assertCanView(ctx.user, courseId)
  const { rows, total } = await resourceRepository.listForCourse(ctx.db, courseId, query.search, query)
  return { data: rows.map(present), meta: pageMeta(query, total) }
}

export async function downloadUrl(ctx: RequestContext, resourceId: string) {
  const resource = await resourceRepository.findById(resourceId)
  if (!resource) throw errors.notFound('Resource not found.')
  await assertCanView(ctx.user, resource.courseId)
  const url = await storage.signedUrl(storage.BUCKETS.resources, resource.filePath, { downloadName: resource.fileName })
  return { url, fileName: resource.fileName, expiresIn: storage.SIGNED_URL_TTL_SECONDS }
}

export async function remove(ctx: RequestContext, resourceId: string) {
  const resource = await resourceRepository.findById(resourceId)
  if (!resource) throw errors.notFound('Resource not found.')
  if (ctx.user.role !== 'admin' && resource.uploadedBy?.id !== ctx.user.id) {
    throw errors.forbidden('Only the uploader or an admin can delete this resource.')
  }
  await resourceRepository.remove(resourceId)
  await storage.remove(storage.BUCKETS.resources, [resource.filePath])
  await auditRepository.record(ctx.user.id, 'resource.delete', 'resource', resourceId)
}
