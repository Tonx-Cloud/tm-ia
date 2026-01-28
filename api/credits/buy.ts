import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { addCredits, getBalance } from '../_lib/credits.js'
import { CREDIT_PACKAGES, getPackageById, type CreditPackageId } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

/**
 * Buy credit packages
 * 
 * POST /api/credits/buy
 * Body: { packageId: 'starter' | 'creator' | 'pro' | 'studio' }
 * 
 * In production, this initiates a PIX payment flow.
 * For dev/testing, credits are added immediately (mock mode).
 */
export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 3, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  const { packageId, mock } = req.body as { packageId?: string; mock?: boolean }
  
  // Support legacy amount-based purchase for backward compatibility
  const { amount, reason } = req.body as { amount?: number; reason?: string }
  if (typeof amount === 'number' && amount > 0) {
    const purchaseReason = (reason as any) || 'admin_adjust'
    try {
      const balance = addCredits(session.userId, amount, purchaseReason)
      ctx.log('info', 'credits.buy.legacy', { added: amount, balance })
      return res.status(200).json({ ok: true, added: amount, balance, requestId: ctx.requestId })
    } catch (err) {
      ctx.log('error', 'credits.buy.error', { message: (err as Error).message })
      return res.status(400).json({ error: (err as Error).message, requestId: ctx.requestId })
    }
  }

  // Package-based purchase
  if (!packageId) {
    return res.status(400).json({ 
      error: 'packageId required', 
      availablePackages: CREDIT_PACKAGES.map(p => p.id),
      requestId: ctx.requestId 
    })
  }

  const pkg = getPackageById(packageId)
  if (!pkg) {
    return res.status(400).json({ 
      error: 'Invalid packageId', 
      availablePackages: CREDIT_PACKAGES.map(p => p.id),
      requestId: ctx.requestId 
    })
  }

  // In development/mock mode, add credits immediately
  const isDev = process.env.NODE_ENV !== 'production' || mock === true
  
  if (isDev) {
    try {
      const balance = addCredits(session.userId, pkg.credits, 'purchase')
      ctx.log('info', 'credits.buy.mock', { 
        packageId: pkg.id, 
        credits: pkg.credits, 
        priceUSD: pkg.priceUSD,
        balance 
      })
      return res.status(200).json({ 
        ok: true, 
        mock: true,
        package: pkg,
        added: pkg.credits, 
        balance, 
        requestId: ctx.requestId 
      })
    } catch (err) {
      ctx.log('error', 'credits.buy.error', { message: (err as Error).message })
      return res.status(400).json({ error: (err as Error).message, requestId: ctx.requestId })
    }
  }

  // Production: initiate PIX payment flow
  // TODO: Create Mercado Pago preference and return payment URL
  ctx.log('info', 'credits.buy.initiate', { packageId: pkg.id, priceUSD: pkg.priceUSD })
  return res.status(200).json({
    ok: true,
    mock: false,
    package: pkg,
    paymentUrl: null, // TODO: Return MP preference URL
    message: 'Payment flow not yet implemented in production',
    requestId: ctx.requestId,
  })
})
