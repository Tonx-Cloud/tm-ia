import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 3, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, cost, mode } = req.body as { projectId?: string; cost?: number; mode?: 'demo' | 'pro' }
  if (!projectId) {
    ctx.log('warn', 'demo.unlock.invalid_body')
    return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })
  }
  const amount = typeof cost === 'number' && cost > 0 ? cost : 8
  const reason = mode === 'pro' ? 'pro_render' : 'demo_unlock'

  // seed demo balance if missing
  if (getBalance(session.userId) === 0) {
    addCredits(session.userId, 50, 'initial')
  }

  try {
    spendCredits(session.userId, amount, reason, { projectId })
  } catch (err) {
    ctx.log('warn', 'demo.unlock.insufficient_credits', { balance: getBalance(session.userId) })
    return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
  }

  ctx.log('info', 'demo.unlock.ok', { projectId, amount })
  return res.status(200).json({ ok: true, balance: getBalance(session.userId), requestId: ctx.requestId })
})
