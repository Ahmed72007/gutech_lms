import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'

const server = createApp().listen(env.PORT, () => {
  logger.info(`GUtech LMS API listening on http://localhost:${env.PORT}`)
})

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`)
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => shutdown('SIGTERM'))
process.on('SIGINT', () => shutdown('SIGINT'))
