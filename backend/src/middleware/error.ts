import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { logger } from '../config/logger.js'
import { DbError } from '../utils/db.js'
import { errors, HttpError } from '../utils/http.js'

function send(res: Response, status: number, code: string, message: string, details?: unknown) {
  res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } })
}

export function notFoundHandler(_req: Request, _res: Response, next: NextFunction) {
  next(errors.notFound('The requested endpoint was not found.'))
}

export function errorHandler(error: unknown, req: Request, res: Response, _next: NextFunction) {
  if (error instanceof ZodError) {
    const details = error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message }))
    return send(res, 422, 'VALIDATION_ERROR', 'Please check the highlighted fields.', details)
  }

  if (error instanceof HttpError) return send(res, error.status, error.code, error.message, error.details)

  // Malformed JSON body from express.json()
  if (error instanceof SyntaxError && 'type' in error && error.type === 'entity.parse.failed') {
    return send(res, 400, 'BAD_REQUEST', 'The request body is not valid JSON.')
  }
  if (error && typeof error === 'object' && 'type' in error && error.type === 'entity.too.large') {
    return send(res, 413, 'PAYLOAD_TOO_LARGE', 'The request body is too large.')
  }

  if (error instanceof DbError) {
    switch (error.pgCode) {
      case '23505':
        return send(res, 409, 'CONFLICT', 'This record already exists.')
      case '23503':
        return send(res, 422, 'VALIDATION_ERROR', 'A referenced record does not exist.')
      case '23514':
      case '22P02':
      case '22007':
      case '22008':
        return send(res, 422, 'VALIDATION_ERROR', 'The submitted data is invalid.')
      case '42501':
        return send(res, 403, 'FORBIDDEN', 'You do not have permission to access this record.')
      case 'PGRST116':
        return send(res, 404, 'NOT_FOUND', 'The requested resource was not found.')
    }
  }

  logger.error({ err: error, method: req.method, url: req.originalUrl }, 'Unhandled error')
  return send(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred. Please try again.')
}
