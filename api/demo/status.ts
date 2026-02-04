import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { checkDemoLimit } from '../_lib/demoUsage.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { createLogger } from '../_lib/logger.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  const logger = createLogger({ requestId: ctx.requestId, userId: ctx.userId })
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getSessionFromRequest(req)
  if (!session) {
    logger.warn('auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rateKey = `demo:${session.userId}`
  const rate = await checkRateLimit(req, { limit: 10, windowMs: 60_000, key: rateKey, ctx })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: rate.retryAfterSeconds,
      requestId: ctx.requestId,
    })
  }

  const limit = checkDemoLimit(session.userId)
  if (limit.blocked) {
    logger.warn('demo.cooldown', { retryInSeconds: limit.retryInSeconds })
    return res.status(429).json({
      error: 'Demo limit reached',
      retryInSeconds: limit.retryInSeconds,
      code: 'COOLDOWN',
      requestId: ctx.requestId,
    })
  }

  logger.info('demo.ready')
  return res.status(200).json({ status: 'ready', requestId: ctx.requestId })
})

