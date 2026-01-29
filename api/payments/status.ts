import type { VercelRequest, VercelResponse } from '@vercel/node'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { addCredits } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { loadPayment, savePayment } from '../_lib/payments.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { paymentId } = req.query as { paymentId?: string }
  if (!paymentId) return res.status(400).json({ error: 'paymentId required', requestId: ctx.requestId })

  const rec = loadPayment(paymentId)
  if (!rec) {
    return res.status(404).json({ error: 'payment not found', requestId: ctx.requestId })
  }

  const elapsed = Date.now() - rec.createdAt
  const timeoutMs = 5 * 60 * 1000 // 5 minutes
  const mpToken = process.env.MP_ACCESS_TOKEN
  const CREDIT_RATE = 10 // credits per real

  if (rec.status === 'pending') {
    if (rec.provider === 'mp' && mpToken) {
      try {
        const client = new MercadoPagoConfig({ accessToken: mpToken })
        const payment = await new Payment(client).get({ id: rec.paymentId })
        const mpStatus = payment.status as string
        if (mpStatus === 'approved') {
          rec.status = 'confirmed'
          rec.confirmedAt = Date.now()
        } else if (mpStatus === 'cancelled' || mpStatus === 'rejected' || mpStatus === 'expired') {
          rec.status = 'expired'
        }
      } catch (err) {
        ctx.log('warn', 'pix.status.mp_error', { message: (err as Error).message })
      }
    } else {
      if (elapsed > timeoutMs) {
        rec.status = 'expired'
      } else if (elapsed > 9000) {
        rec.status = 'confirmed'
        rec.confirmedAt = Date.now()
      }
    }
    savePayment(rec)
  }

  let balance: number | undefined
  if (rec.status === 'confirmed' && !rec.credited && rec.userId) {
    try {
      const credits = rec.amount * CREDIT_RATE
      balance = await addCredits(rec.userId, credits, 'payment_pix')
      rec.credited = true
      rec.creditedAt = Date.now()
      savePayment(rec)
      ctx.log('info', 'pix.status.credited', { paymentId, userId: rec.userId, amount: rec.amount, credits, balance })
    } catch (err) {
      ctx.log('error', 'pix.status.credit_error', { message: (err as Error).message, paymentId })
    }
  }

  ctx.log('info', 'pix.status', { paymentId, status: rec.status })
  return res.status(200).json({ ...rec, balance, requestId: ctx.requestId })
})
