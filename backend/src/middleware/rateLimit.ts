import type { Request } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'

const rateLimitedBody = (message: string) => ({ error: { code: 'RATE_LIMITED', message } })

const emailOf = (req: Request) =>
  String((req.body as { email?: unknown } | undefined)?.email ?? '')
    .trim()
    .toLowerCase()
    .slice(0, 254)

const ipOf = (req: Request) => ipKeyGenerator(req.ip ?? 'unknown')

/** 5 attempts per 15 minutes per IP + email. */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `${ipOf(req)}:${emailOf(req)}`,
  message: rateLimitedBody('Too many sign-in attempts. Please try again in 15 minutes.'),
})

/** 3 reset requests per hour per email. */
export const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 3,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `forgot:${emailOf(req) || ipOf(req)}`,
  message: rateLimitedBody('Too many reset requests. Please try again later.'),
})

/** 20 chat messages per minute per user. Must run after requireAuth. */
export const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `chat:${req.user?.id ?? ipOf(req)}`,
  message: rateLimitedBody('You are sending messages too quickly. Please wait a moment.'),
})

/** Sensitive authenticated actions (password change). */
export const sensitiveLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: (req) => `sensitive:${req.user?.id ?? ipOf(req)}`,
  message: rateLimitedBody('Too many attempts. Please try again later.'),
})

/** Broad safety net for the whole API. */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: rateLimitedBody('Too many requests. Please slow down.'),
})
