import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { PRICING, estimateRenderCost, formatCostDisplay } from '../_lib/pricing.js'
import { getRenderConfig } from './config.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { createRenderJob, type RenderFormat } from '../_lib/renderPipeline.js'

/**
 * Estimate render cost using new pricing model
 * @see docs/CREDITS_MODEL.md
 */
function estimateCost(duration: number, quality: string, scenesCount: number, animationSeconds = 0) {
  return estimateRenderCost({
    duration,
    quality,
    scenesCount,
    hasAnimation: animationSeconds > 0,
    animationSeconds,
  })
}

function mapAspectRatioToFormat(aspectRatio: string): RenderFormat {
  switch (aspectRatio) {
    case '9:16':
      return 'vertical'
    case '1:1':
      return 'square'
    case '16:9':
    default:
      return 'horizontal'
  }
}

export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 10, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, cost, configId, config, renderOptions } = req.body as {
    projectId?: string
    cost?: number
    configId?: string
    config?: {
      format: string
      duration: number
      scenesCount: number
      stylePrompt?: string
      aspectRatio: string
      quality: string
    }
    renderOptions?: {
      format?: RenderFormat
      watermark?: boolean
      crossfade?: boolean
      crossfadeDuration?: number
    }
  }
  
  if (!projectId) {
    ctx.log('warn', 'render.pro.invalid_body')
    return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })
  }

  // Get config from configId or inline
  let cfg = configId ? getRenderConfig(configId) : undefined
  if (!cfg && config && config.duration && config.scenesCount && config.aspectRatio && config.quality && config.format) {
    const est = estimateCost(config.duration, config.quality, config.scenesCount)
    cfg = {
      id: 'inline',
      projectId,
      estimatedCredits: est,
      format: config.format,
      duration: config.duration,
      scenesCount: config.scenesCount,
      stylePrompt: config.stylePrompt,
      aspectRatio: config.aspectRatio,
      quality: config.quality,
      createdAt: Date.now(),
    }
  }

  const amount = cfg?.estimatedCredits ?? (typeof cost === 'number' && cost > 0 ? cost : 30)

  // Seed demo balance in dev if empty
  if (getBalance(session.userId) === 0) {
    addCredits(session.userId, 50, 'initial')
  }

  try {
    spendCredits(session.userId, amount, 'pro_render', { projectId })
  } catch (err) {
    ctx.log('warn', 'render.pro.insufficient_credits', { balance: getBalance(session.userId) })
    return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
  }

  const balance = getBalance(session.userId)
  const renderId = crypto.randomUUID()

  // Determine render format from config or explicit renderOptions
  const format: RenderFormat = renderOptions?.format || (cfg?.aspectRatio ? mapAspectRatioToFormat(cfg.aspectRatio) : 'horizontal')

  const job = createRenderJob(
    session.userId,
    {
      renderId,
      projectId,
      configId: cfg?.id || configId || 'inline',
      outputUrl: undefined,
      error: undefined,
    },
    {
      format,
      watermark: renderOptions?.watermark ?? false,
      crossfade: renderOptions?.crossfade ?? false,
      crossfadeDuration: renderOptions?.crossfadeDuration ?? 0.5,
    }
  )

  ctx.log('info', 'render.pro.started', {
    projectId,
    amount,
    balance,
    configId: cfg?.id,
    renderId,
    format,
    watermark: renderOptions?.watermark ?? false,
    crossfade: renderOptions?.crossfade ?? false,
  })

  return res.status(200).json({
    ok: true,
    cost: amount,
    balance,
    configId: cfg?.id,
    renderId,
    status: 'pending',
    format,
    requestId: ctx.requestId,
  })
})
