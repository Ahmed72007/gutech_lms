import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { errorHandler, notFoundHandler } from './middleware/error.js'
import { apiLimiter } from './middleware/rateLimit.js'
import adminRoutes from './routes/admin.routes.js'
import appRoutes from './routes/app.routes.js'
import authRoutes from './routes/auth.routes.js'

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN,
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['Content-Disposition'],
    }),
  )
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(
    pinoHttp({
      logger,
      // Log method, url and status only; never bodies.
      serializers: {
        req: (req: { method: string; url: string }) => ({ method: req.method, url: req.url }),
        res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
      },
    }),
  )

  app.get('/health', (_req, res) => {
    res.json({ data: { status: 'ok' } })
  })

  app.use('/api', apiLimiter)
  app.use('/api/auth', authRoutes)
  app.use('/api/admin', adminRoutes)
  app.use('/api', appRoutes)
  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}
