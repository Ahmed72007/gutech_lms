import pino from 'pino'
import { env, isTest } from './env.js'

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  // Never log tokens, passwords or cookies.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.currentPassword',
      '*.newPassword',
      '*.tempPassword',
      '*.accessToken',
      '*.refreshToken',
    ],
    censor: '[redacted]',
  },
  ...(env.NODE_ENV === 'development' ? { transport: { target: 'pino-pretty', options: { colorize: true } } } : {}),
})
