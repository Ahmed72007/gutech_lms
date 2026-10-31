import type { NextFunction, Request, Response } from 'express'
import multer from 'multer'
import type { UploadedFile } from '../types/domain.js'
import { errors } from '../utils/http.js'

/**
 * Accepts one multipart file held in memory with a per-route size cap.
 * JSON requests pass straight through, so routes can accept either.
 */
export function singleFile(field: string, maxBytes: number) {
  const handler = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxBytes, files: 1, fields: 20, fieldSize: 64 * 1024 },
  }).single(field)

  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, (error: unknown) => {
      if (!error) return next()
      if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
          return next(errors.unprocessable(`File is too large. The maximum size is ${Math.round(maxBytes / 1024 / 1024)} MB.`))
        }
        return next(errors.unprocessable(`Upload rejected: ${error.message}.`))
      }
      return next(error)
    })
  }
}

export function uploadedFile(req: Request): UploadedFile | null {
  if (!req.file) return null
  return { buffer: req.file.buffer, originalName: req.file.originalname, size: req.file.size }
}
