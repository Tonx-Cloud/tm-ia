import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { addCredits } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { createLogger } from '../_lib/logger.js'

export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const session = getSession(req)
  if (!session || session.role !== 'admin') {
    return res.status(403).json({ error: 'Admin required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId
  const logger = createLogger({ requestId: ctx.requestId, userId: session.userId })

  const { userId, amount, reason } = req.body as { userId?: string; amount?: number; reason?: string }
  if (!userId || typeof amount !== 'number' || !reason) {
    return res.status(400).json({ error: 'userId, amount, reason required', requestId: ctx.requestId })
  }
  try {
    const balance = addCredits(userId, amount, (reason as any) || 'admin_adjust')
    logger.info('credits.admin.add', { target: userId, amount })
    return res.status(200).json({ ok: true, balance, requestId: ctx.requestId })
  } catch (err) {
    logger.error('credits.admin.error', { message: (err as Error).message })
    return res.status(400).json({ error: (err as Error).message, requestId: ctx.requestId })
  }
})
