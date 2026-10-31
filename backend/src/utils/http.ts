import type { NextFunction, Request, RequestHandler, Response } from 'express'
import type { PageMeta, RequestContext } from '../types/domain.js'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

export const errors = {
  badRequest: (message = 'The request is malformed.') => new HttpError(400, 'BAD_REQUEST', message),
  unauthorized: (message = 'Please sign in to continue.') => new HttpError(401, 'UNAUTHORIZED', message),
  forbidden: (message = 'You do not have permission to perform this action.') => new HttpError(403, 'FORBIDDEN', message),
  notFound: (message = 'The requested resource was not found.') => new HttpError(404, 'NOT_FOUND', message),
  conflict: (message: string, code = 'CONFLICT') => new HttpError(409, code, message),
  unprocessable: (message: string, details?: unknown) => new HttpError(422, 'VALIDATION_ERROR', message, details),
}

/** Wraps an async handler so rejected promises reach the error middleware. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next)
  }
}

export function sendData<T>(res: Response, data: T, status = 200) {
  res.status(status).json({ data })
}

export function sendPage(res: Response, result: { data: unknown[]; meta: PageMeta }) {
  res.status(200).json(result)
}

/** Request context set by requireAuth. Throws if a route forgot the middleware. */
export function ctx(req: Request): RequestContext {
  if (!req.user || !req.db || !req.accessToken) throw errors.unauthorized()
  return { user: req.user, db: req.db, accessToken: req.accessToken }
}
