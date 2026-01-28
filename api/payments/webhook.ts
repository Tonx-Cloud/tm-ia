import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { addCredits } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { loadPayment, savePayment, type PaymentRecord } from '../_lib/payments.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const mpToken = process.env.MP_ACCESS_TOKEN
  const mpSecret = process.env.MP_WEBHOOK_SECRET
  const body = req.body as any
  const paymentId = body?.data?.id || body?.id || body?.paymentId || (req.query as any)?.id

  // Mock mode: if paymentId starts with 'mock-', handle as mock regardless of token config
  const isMockId = typeof paymentId === 'string' && paymentId.startsWith('mock-')
  
  if (!mpToken || isMockId) {
    if (!paymentId) {
      return res.status(200).json({ ok: true, message: 'Mock mode - send paymentId to simulate confirmation', mock: true, requestId: ctx.requestId })
    }
    const rec = loadPayment(paymentId)
    if (!rec) {
      return res.status(404).json({ error: 'Payment not found', requestId: ctx.requestId })
    }
    if (rec.status === 'pending') {
      rec.status = 'confirmed'
      rec.confirmedAt = Date.now()
      if (!rec.credited && rec.userId) {
        const CREDIT_RATE = 10
        const credits = rec.amount * CREDIT_RATE
        const balance = addCredits(rec.userId, credits, 'payment_pix')
        rec.credited = true
        rec.creditedAt = Date.now()
        savePayment(rec)
        ctx.log('info', 'pix.webhook.mock.credited', { paymentId, userId: rec.userId, amount: rec.amount, credits, balance })
        return res.status(200).json({ ok: true, credits, balance, mock: true, requestId: ctx.requestId })
      }
      savePayment(rec)
    }
    return res.status(200).json({ ok: true, status: rec.status, mock: true, requestId: ctx.requestId })
  }

  if (!paymentId) return res.status(400).json({ error: 'paymentId required', requestId: ctx.requestId })

  // Verify signature if secret is set
  if (mpSecret) {
    const signature = req.headers['x-signature'] as string
    if (!signature) return res.status(400).json({ error: 'Missing signature', requestId: ctx.requestId })
    const expected = crypto.createHmac('sha256', mpSecret).update(JSON.stringify(body)).digest('hex')
    if (signature !== expected) return res.status(401).json({ error: 'Invalid signature', requestId: ctx.requestId })
  }

  try {
    const client = new MercadoPagoConfig({ accessToken: mpToken })
    const payment = await new Payment(client).get({ id: paymentId })

    const mpStatus = payment.status as string
    const amount = Number(payment.transaction_amount || payment.metadata?.amount || 0)
    const userId = (payment.metadata && payment.metadata.userId) || loadPayment(paymentId)?.userId

    if (!userId) {
      ctx.log('warn', 'pix.webhook.no_user', { paymentId })
      return res.status(202).json({ ok: true, message: 'userId missing', requestId: ctx.requestId })
    }

    let rec: PaymentRecord | null = loadPayment(paymentId)
    if (!rec) {
      rec = {
        paymentId,
        provider: 'mp',
        status: 'pending',
        amount: amount > 0 ? amount : 0,
        createdAt: Date.now(),
        userId,
      }
    }

    if (mpStatus === 'approved') {
      rec.status = 'confirmed'
      rec.confirmedAt = Date.now()
      if (!rec.credited) {
        try {
          const CREDIT_RATE = 10
          const credits = (amount || rec.amount) * CREDIT_RATE
          const balance = addCredits(userId, credits, 'payment_pix')
          rec.credited = true
          rec.creditedAt = Date.now()
          savePayment(rec)
          ctx.log('info', 'pix.webhook.credited', { paymentId, userId, amount, credits, balance })
          return res.status(200).json({ ok: true, balance, requestId: ctx.requestId })
        } catch (err) {
          ctx.log('error', 'pix.webhook.credit_error', { message: (err as Error).message, paymentId })
          savePayment(rec)
          return res.status(500).json({ error: 'Failed to credit user', requestId: ctx.requestId })
        }
      }
    } else if (mpStatus === 'cancelled' || mpStatus === 'rejected' || mpStatus === 'expired') {
      rec.status = 'expired'
      savePayment(rec)
      return res.status(200).json({ ok: true, status: rec.status, requestId: ctx.requestId })
    }

    savePayment(rec)
    return res.status(200).json({ ok: true, status: rec.status, requestId: ctx.requestId })
  } catch (err) {
    ctx.log('error', 'pix.webhook.exception', { message: (err as Error).message })
    return res.status(500).json({ error: 'Webhook handling failed', requestId: ctx.requestId })
  }
})
