import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv } from './_lib/env.js'
import { withObservability } from './_lib/observability.js'
import { createLogger } from './_lib/logger.js'

export default withObservability(function handler(_req: VercelRequest, res: VercelResponse, ctx) {
  const logger = createLogger({ requestId: ctx.requestId, userId: ctx.userId })
  try {
    loadEnv()
    logger.info('health.ok')
    res.status(200).json({ ok: true, ts: Date.now() })
  } catch (err) {
    logger.error('health.fail', { message: (err as Error).message })
    res.status(500).json({ ok: false, error: (err as Error).message, requestId: ctx.requestId })
  }
})
