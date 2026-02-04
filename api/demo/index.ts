import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv } from '../_lib/env.js'
import { getSessionFromRequest } from '../_lib/auth.js'
import { checkDemoLimit, logDemoUsage } from '../_lib/demoUsage.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rateKey = `demo:start:${session.userId}`
  const rate = await checkRateLimit(req, { limit: 5, windowMs: 60_000, key: rateKey, ctx })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  const limit = checkDemoLimit(session.userId)
  if (limit.blocked) {
    ctx.log('warn', 'demo.cooldown', { retryInSeconds: limit.retryInSeconds })
    return res.status(429).json({ error: 'Demo limit reached', retryInSeconds: limit.retryInSeconds, code: 'COOLDOWN', requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, filePath } = req.body as { projectId?: string; filePath?: string }
  if (!projectId || !filePath) {
    ctx.log('warn', 'demo.invalid_body')
    return res.status(400).json({ error: 'projectId and filePath are required', requestId: ctx.requestId })
  }

  logDemoUsage(session.userId)
  ctx.log('info', 'demo.start', { projectId })
  return res.status(200).json({ status: 'processing', projectId, filePath, userId: session.userId, requestId: ctx.requestId })
})

