import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rateKey = `preview:${session.userId}`
  const rate = await checkRateLimit(req, { limit: 3, windowMs: 60_000, key: rateKey, ctx })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { filePath, hook, style } = req.body as { filePath?: string; hook?: string; style?: string }
  if (!filePath || !hook || !style) {
    ctx.log('warn', 'demo.preview.invalid_body')
    return res.status(400).json({ error: 'filePath, hook and style are required', requestId: ctx.requestId })
  }

  const previewUrl = 'https://www.w3schools.com/html/mov_bbb.mp4'

  ctx.log('info', 'demo.preview.mock_ready', { hasFile: Boolean(filePath), hasHook: Boolean(hook), style })
  return res.status(200).json({ previewUrl, requestId: ctx.requestId })
})

