import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { addCredits, getBalance, getLedger } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { createLogger } from '../_lib/logger.js'

export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId
  const logger = createLogger({ requestId: ctx.requestId, userId: session.userId })

  try {
    // seed demo balance if empty (dev UX)
    if (getBalance(session.userId) === 0) {
      addCredits(session.userId, 50, 'initial')
    }
    const balance = getBalance(session.userId)
    const recentEntries = getLedger(session.userId, 10)
    logger.info('credits.read', { balance, count: recentEntries.length })
    return res.status(200).json({ balance, recentEntries, requestId: ctx.requestId })
  } catch (err) {
    logger.error('credits.read.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to read credits', requestId: ctx.requestId })
  }
})
