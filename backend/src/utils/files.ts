import { randomUUID } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { errors } from './http.js'
import type { UploadedFile } from '../types/domain.js'

const MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  zip: 'application/zip',
  png: 'image/png',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
} as const

const IMAGES = [MIME.png, MIME.jpeg, MIME.gif, MIME.webp]

export const FILE_POLICIES = {
  /** Course resources, assignment attachments and submissions. */
  document: {
    mimes: [MIME.pdf, MIME.docx, MIME.pptx, MIME.zip, ...IMAGES],
    maxBytes: 25 * 1024 * 1024,
    label: 'PDF, DOCX, PPTX, ZIP or image',
  },
  complaint: {
    mimes: [MIME.pdf, ...IMAGES],
    maxBytes: 10 * 1024 * 1024,
    label: 'PDF or image',
  },
  avatar: {
    mimes: IMAGES,
    maxBytes: 2 * 1024 * 1024,
    label: 'PNG, JPEG, GIF or WebP image',
  },
} as const

export type FilePolicy = (typeof FILE_POLICIES)[keyof typeof FILE_POLICIES]

/**
 * Validates a file by its magic bytes (never by extension or client MIME type).
 * Returns the detected MIME type and extension.
 */
export async function inspectFile(file: UploadedFile, policy: FilePolicy): Promise<{ mime: string; ext: string }> {
  if (file.size > policy.maxBytes) {
    throw errors.unprocessable(`File is too large. The maximum size is ${Math.round(policy.maxBytes / 1024 / 1024)} MB.`)
  }
  const detected = await fileTypeFromBuffer(file.buffer)
  if (!detected || !(policy.mimes as readonly string[]).includes(detected.mime)) {
    throw errors.unprocessable(`This file type is not allowed. Upload a ${policy.label} file.`)
  }
  return { mime: detected.mime, ext: detected.ext }
}

/** Keeps file names portable and safe for storage paths and download headers. */
export function sanitizeFileName(name: string): string {
  const cleaned = name
    .normalize('NFKD')
    .replace(/[^\w.\- ]+/g, '')
    .replace(/\s+/g, '-')
    .replace(/^\.+/, '')
    .slice(-120)
  return cleaned || 'file'
}

/** `{prefix}/{uuid}-{filename}` */
export function storagePath(prefix: string, fileName: string): string {
  return `${prefix}/${randomUUID()}-${sanitizeFileName(fileName)}`
}
