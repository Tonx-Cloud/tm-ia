import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { createLogger, type LogContext } from './logger.js'

export function withErrorHandler(handler: (req: VercelRequest, res: VercelResponse, ctx: LogContext) => Promise<any> | any) {
  return async function wrapped(req: VercelRequest, res: VercelResponse) {
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID()
    res.setHeader('x-request-id', requestId)
    const logger = createLogger({ requestId })
    try {
      await handler(req, res, { requestId })
    } catch (err) {
      logger.error('api.error', { message: (err as Error).message, stack: (err as Error).stack })
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error', requestId })
      }
    }
  }
}
