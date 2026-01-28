import crypto from 'crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'

export type ObservabilityContext = {
  requestId: string
  userId?: string
  log: (level: 'info' | 'warn' | 'error', event: string, meta?: Record<string, unknown>) => void
}

type Handler = (req: VercelRequest, res: VercelResponse, ctx: ObservabilityContext) => Promise<any> | any

export function withObservability(handler: Handler) {
  return async function wrapped(req: VercelRequest, res: VercelResponse) {
    const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID()
    res.setHeader('x-request-id', requestId)
    const startedAt = Date.now()

    const ctx: ObservabilityContext = {
      requestId,
      log(level, event, meta = {}) {
        const payload = {
          level,
          event,
          requestId,
          userId: ctx.userId ?? null,
          method: req.method,
          path: req.url,
          durationMs: Date.now() - startedAt,
          ...meta,
          ts: new Date().toISOString(),
        }
        const text = JSON.stringify(payload)
        if (level === 'error') console.error(text)
        else if (level === 'warn') console.warn(text)
        else console.log(text)
      },
    }

    try {
      await handler(req, res, ctx)
      ctx.log('info', 'request.complete', { statusCode: res.statusCode })
    } catch (err) {
      const message = (err as Error).message || 'Unhandled error'
      ctx.log('error', 'request.error', { message, stack: (err as Error).stack })
      if (!res.headersSent) {
        res.status(500).json({ error: 'Internal error', requestId })
      }
    }
  }
}
