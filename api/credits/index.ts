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

  const logger = createLogger({ requestId: ctx.requestId })

  // --- Auth audit (server-side only; never log full token) ---
  const rawHeader = (req.headers['authorization'] ?? (req.headers as Record<string, unknown>)['Authorization']) as
    | string
    | string[]
    | undefined
  const headerValue = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader
  const bearer = headerValue?.toString().trim() || ''
  const token = bearer.replace(/^Bearer\s+/i, '')
  const hasAuthHeader = !!token
  const tokenLooksJwt = hasAuthHeader && token.split('.').length === 3
  const maskedToken = hasAuthHeader ? (token.length <= 12 ? token : `${token.slice(0, 6)}...${token.slice(-6)}`) : undefined

  logger.info('credits.auth.audit', {
    hasAuthHeader,
    tokenLooksJwt,
    token: maskedToken,
    host: (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || undefined,
    vercelEnv: process.env.VERCEL_ENV,
  })

  // IMPORTANT: TM-IA now uses Supabase access_token as tm_auth_token.
  // So we must accept Supabase JWTs here.
  const session = await getSessionFromRequest(req)
  if (!session) {
    logger.warn('credits.auth.denied', { hasAuthHeader, tokenLooksJwt })
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }

  ctx.userId = session.userId
  const userLogger = logger.child({ userId: session.userId })

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
    userLogger.info('credits.read', { balance, count: recentEntries.length, email: session.email })
    return res.status(200).json({ balance, recentEntries, requestId: ctx.requestId })
  } catch (err) {
    userLogger.error('credits.read.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to read credits', requestId: ctx.requestId })
  }
})
