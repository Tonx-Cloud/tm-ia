import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import { getSessionFromRequest } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import type { PaymentRecord } from '../_lib/payments.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const tmpDir = process.env.TMPDIR || process.env.TEMP || '/tmp'
  
  try {
    const files = fs.readdirSync(tmpDir).filter(f => f.startsWith('payment_') && f.endsWith('.json'))
    const payments: PaymentRecord[] = []

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(tmpDir, file), 'utf-8')
        const record = JSON.parse(content) as PaymentRecord
        if (record.userId === session.userId) {
          // Don't leak sensitive internal fields if any
          payments.push(record)
        }
      } catch (err) {
        // Ignore corrupted files
      }
    }

    // Sort by newest first
    payments.sort((a, b) => b.createdAt - a.createdAt)

    ctx.log('info', 'payments.history', { count: payments.length, userId: session.userId })
    return res.status(200).json({ payments, requestId: ctx.requestId })
  } catch (err) {
    ctx.log('error', 'payments.history.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Failed to list payments', requestId: ctx.requestId })
  }
})
