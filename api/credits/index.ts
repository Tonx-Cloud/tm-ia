import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest, isVipEmail } from '../_lib/auth.js'
import { addCredits, getBalance, getLedger } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { createLogger } from '../_lib/logger.js'

const VIP_TARGET_BALANCE = 999999

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // IMPORTANT: TM-IA now uses Supabase access_token as tm_auth_token.
  // So we must accept Supabase JWTs here.
  const session = await getSessionFromRequest(req)
  if (!session) {
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }

  ctx.userId = session.userId
  const logger = createLogger({ requestId: ctx.requestId, userId: session.userId })

  try {
    let balance = await getBalance(session.userId)

    // VIP/admin top-up (Hilton, etc.)
    if (isVipEmail(session.email) && balance < VIP_TARGET_BALANCE) {
      const toAdd = VIP_TARGET_BALANCE - balance
      await addCredits(session.userId, toAdd, 'admin_adjust')
      balance = await getBalance(session.userId)
    }

    // Non-VIP safety net: if a user record exists with 0 credits (legacy / earlier bug), seed 50.
    if (!isVipEmail(session.email) && balance === 0) {
      await addCredits(session.userId, 50, 'initial')
      balance = await getBalance(session.userId)
    }

    const recentEntries = await getLedger(session.userId, 10)
    logger.info('credits.read', { balance, count: recentEntries.length, email: session.email })
    return res.status(200).json({ balance, recentEntries, requestId: ctx.requestId })
  } catch (err) {
    logger.error('credits.read.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to read credits', requestId: ctx.requestId })
  }
})
