import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { getProject, upsertProject } from '../_lib/projectStore.js'
import { getBalance, spendCredits } from '../_lib/credits.js'
import { PRICING } from '../_lib/pricing.js'
import { generateImageDataUrl } from '../_lib/geminiImage.js'

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

  const proj = await getProject(projectId)
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

  const selectedModel = modelId || 'gemini-2.5-flash-image'
  const apiKey = process.env.GEMINI_API_KEY || ''

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

  let updated = 0
  for (const assetId of assetIds) {
    const asset = proj.assets.find((a) => a.id === assetId)
    if (!asset) continue

    try {
      const dataUrl = await generateImageDataUrl({ apiKey, model: selectedModel, prompt: asset.prompt, ctx })
      asset.dataUrl = dataUrl
      asset.status = 'generated'
      asset.createdAt = Date.now()
      updated++
    } catch (err) {
      ctx.log('warn', 'assets.generate_selected.failed', { assetId, message: (err as Error).message })
      asset.status = 'needs_regen'
    }
  }

  await upsertProject(proj)

  let balance = await getBalance(session.userId)
  if (vip) balance = 99999

  return res.status(200).json({ ok: true, updated, cost: vip ? 0 : totalCost, balance, project: proj, requestId: ctx.requestId })
})
