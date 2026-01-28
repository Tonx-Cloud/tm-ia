import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { MercadoPagoConfig, Payment } from 'mercadopago'
import { getSession } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { savePayment, type PaymentRecord } from '../_lib/payments.js'

// PIX charge: tries Mercado Pago if MP_ACCESS_TOKEN is set, otherwise falls back to mock.
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  const { amount, email } = req.body as { amount?: number; email?: string }
  const value = typeof amount === 'number' && amount > 0 ? amount : 25
  const mpToken = process.env.MP_ACCESS_TOKEN
  const baseUrl = process.env.MP_NOTIFICATION_URL || process.env.PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined)
  const idempotencyKey = crypto.randomUUID()
  const description = 'TM-IA Credits'

  if (mpToken) {
    try {
      const client = new MercadoPagoConfig({ accessToken: mpToken })
      const payment = await new Payment(client).create({
        body: {
          transaction_amount: value,
          description: description || 'TM-IA Credits',
          payment_method_id: 'pix',
          payer: {
            email: email || `${session.userId}@tm-ia.app`,
          },
          metadata: { userId: session.userId, amount: value },
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
        amount: value,
        createdAt: Date.now(),
        userId: session.userId,
        email,
        description,
        externalRef: `${session.userId}:${idempotencyKey}`,
        qrBase64,
        copyCode,
        expiresAt,
      }
      savePayment(recMp)
      ctx.log('info', 'pix.create.mp', { paymentId: mpId, value, userId: session.userId })
      return res.status(200).json({ paymentId: mpId, status: payment.status, qrBase64, qrCode: copyCode, expiresAt, provider: 'mp', requestId: ctx.requestId })
    } catch (err) {
      ctx.log('error', 'pix.mp.exception', { message: (err as Error).message })
      // fallback to mock below
    }
  }

  // Mock QR/copy code (fallback when MP_ACCESS_TOKEN not configured or MP call fails)
  const paymentId = `mock-${Date.now()}`
  const copyCode = `00020126480014BR.GOV.BCB.PIX0136${paymentId}5204000053039865802BR5913TM-IA6008SAOPAULO62070503***6304MOCK`
  // Minimal 1x1 transparent PNG for mock QR
  const qrBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
  const expiresAt = Date.now() + 30 * 60 * 1000 // 30 minutes
  const recMock: PaymentRecord = {
    paymentId,
    provider: 'mock',
    status: 'pending',
    amount: value,
    createdAt: Date.now(),
    userId: session.userId,
    email,
    description,
    copyCode,
    qrBase64,
    expiresAt,
  }
  savePayment(recMock)
  ctx.log('info', 'pix.create.mock', { paymentId, value, userId: session.userId })
  return res.status(200).json({ paymentId, status: 'pending', qrBase64, qrCode: copyCode, expiresAt, provider: 'mock', requestId: ctx.requestId })
})
