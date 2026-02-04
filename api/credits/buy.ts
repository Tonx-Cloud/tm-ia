import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { getSessionFromRequest } from '../_lib/auth.js'
import { addCredits } from '../_lib/credits.js'
import { CREDIT_PACKAGES, getPackageById } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { savePayment, type PaymentRecord } from '../_lib/payments.js'

/**
 * Buy credit packages
 * 
 * POST /api/credits/buy
 * Body: { packageId: 'starter' | 'creator' | 'pro' | 'studio' }
 * 
 * In production, this initiates a PIX payment flow.
 * For dev/testing, credits are added immediately (mock mode).
 */
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = await checkRateLimit(req, { limit: 3, windowMs: 60_000, ctx })
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
      requestId: ctx.requestId,
    })
  }

  const pkg = getPackageById(packageId)
  if (!pkg) {
    return res.status(400).json({ 
      error: 'Invalid packageId', 
      availablePackages: CREDIT_PACKAGES.map(p => p.id),
      requestId: ctx.requestId,
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
        balance,
      })
      return res.status(200).json({ 
        ok: true, 
        mock: true,
        package: pkg,
        added: pkg.credits, 
        balance, 
        requestId: ctx.requestId,
      })
    } catch (err) {
      ctx.log('error', 'credits.buy.error', { message: (err as Error).message })
      return res.status(400).json({ error: (err as Error).message, requestId: ctx.requestId })
    }
  }

  // Production: initiate PIX payment flow
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!mpToken) {
    return res.status(500).json({ error: 'MP_ACCESS_TOKEN not configured', requestId: ctx.requestId })
  }

  const baseUrl = process.env.MP_NOTIFICATION_URL || process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  const idempotencyKey = crypto.randomUUID()
  const description = `TM-IA Credits - ${pkg.name}`

  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken })
    const payment = await new Payment(client).create({
      body: {
        transaction_amount: pkg.priceBRL,
        description,
        payment_method_id: 'pix',
        payer: {
          email: session.email || `${session.userId}@tm-ia.app`,
        },
        metadata: { userId: session.userId, credits: pkg.credits, packageId: pkg.id },
        external_reference: `${session.userId}:${idempotencyKey}`,
        notification_url: baseUrl ? `${baseUrl}/api/payments/webhook` : undefined,
      },
    })

    const mpId = String(payment.id)
    const qrBase64 = payment.point_of_interaction?.transaction_data?.qr_code_base64
    const copyCode = payment.point_of_interaction?.transaction_data?.qr_code
    const expiresAt = payment.date_of_expiration ? new Date(payment.date_of_expiration).getTime() : undefined

    const recMp: PaymentRecord = {
      paymentId: mpId,
      provider: 'mp',
      status: payment.status === 'pending' ? 'pending' : 'pending',
      amount: pkg.priceBRL,
      createdAt: Date.now(),
      userId: session.userId,
      email: session.email,
      description,
      externalRef: `${session.userId}:${idempotencyKey}`,
      qrBase64,
      copyCode,
      expiresAt,
    }
    savePayment(recMp)

    ctx.log('info', 'credits.buy.initiate', { packageId: pkg.id, priceBRL: pkg.priceBRL, paymentId: mpId })
    return res.status(200).json({
      ok: true,
      mock: false,
      package: pkg,
      paymentId: mpId,
      status: payment.status,
      qrBase64,
      qrCode: copyCode,
      expiresAt,
      provider: 'mp',
      requestId: ctx.requestId,
    })
  } catch (err) {
    ctx.log('error', 'credits.buy.mp_error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Mercado Pago error', details: (err as Error).message, requestId: ctx.requestId })
  }
})
