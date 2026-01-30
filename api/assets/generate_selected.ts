import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { prisma } from '../_lib/prisma.js'
import { getBalance, spendCredits } from '../_lib/credits.js'
import { PRICING } from '../_lib/pricing.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, assetIds, modelId } = (req.body ?? {}) as {
    projectId?: string
    assetIds?: string[]
    modelId?: string
  }

  if (!projectId || !assetIds || !Array.isArray(assetIds) || assetIds.length === 0) {
    return res.status(400).json({ error: 'projectId and assetIds required', requestId: ctx.requestId })
  }

  const proj = await prisma.project.findUnique({ where: { id: projectId } })
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

  const selectedModel = modelId || 'gemini-2.5-flash-image'

  const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')

  // cost per image
  const per = PRICING.REGENERATE_IMAGE
  const totalCost = per * assetIds.length

  if (!vip) {
    try {
      await spendCredits(session.userId, totalCost, 'generate_image', { projectId })
    } catch {
      return res.status(402).json({ error: 'Insufficient credits', required: totalCost, requestId: ctx.requestId })
    }
  }

  // Enqueue jobs for the VM worker (avoids Vercel timeouts)
  const jobs = assetIds.map((assetId) => ({
    projectId,
    userId: session.userId,
    assetId,
    modelId: selectedModel,
    status: 'pending',
  }))

  await prisma.imageJob.createMany({ data: jobs as any })

  let balance = await getBalance(session.userId)
  if (vip) balance = 99999

  return res.status(200).json({ ok: true, enqueued: assetIds.length, cost: vip ? 0 : totalCost, balance, requestId: ctx.requestId })
})
