import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

type RenderConfig = {
  id: string
  projectId: string
  format: string
  duration: number
  scenesCount: number
  stylePrompt?: string
  aspectRatio: string
  quality: string
  estimatedCredits: number
  createdAt: number
}

const store = new Map<string, RenderConfig>()

function estimateCost(duration: number, quality: string, scenesCount: number) {
  let cost = 10
  // +5 por bloco de 15s adicionais acima de 15s
  const extraBlocks = Math.max(0, Math.ceil(duration / 15) - 1)
  cost += extraBlocks * 5
  if (quality === '1080p') cost += 5
  if (quality === '4K') cost += 15
  if (scenesCount > 8) cost += scenesCount - 8
  return cost
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = await checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, format, duration, scenesCount, stylePrompt, aspectRatio, quality } = req.body as {
    projectId?: string
    format?: string
    duration?: number
    scenesCount?: number
    stylePrompt?: string
    aspectRatio?: string
    quality?: string
  }

  if (!projectId || !format || !duration || !scenesCount || !aspectRatio || !quality) {
    ctx.log('warn', 'render.config.invalid_body')
    return res.status(400).json({ error: 'projectId, format, duration, scenesCount, aspectRatio, quality required', requestId: ctx.requestId })
  }

  const estimatedCredits = estimateCost(duration, quality, scenesCount)
  const id = crypto.randomUUID()
  const cfg: RenderConfig = {
    id,
    projectId,
    format,
    duration,
    scenesCount,
    stylePrompt,
    aspectRatio,
    quality,
    estimatedCredits,
    createdAt: Date.now(),
  }
  store.set(id, cfg)
  ctx.log('info', 'render.config.saved', { projectId, configId: id, estimatedCredits })
  return res.status(200).json({ configId: id, estimatedCredits, requestId: ctx.requestId })
})

export function getRenderConfig(id: string) {
  return store.get(id)
}

