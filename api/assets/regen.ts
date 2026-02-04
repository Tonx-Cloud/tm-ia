import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { generateImageDataUrl } from '../_lib/geminiImage.js'
import { getProject, updateAsset } from '../_lib/projectStore.js'
import { getBalance, spendCredits } from '../_lib/credits.js'
import { PRICING } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

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

  const { projectId, assetId, prompt } = req.body as { projectId?: string; assetId?: string; prompt?: string }
  if (!projectId || !assetId) {
    ctx.log('warn', 'assets.regen.invalid_body')
    return res.status(400).json({ error: 'projectId and assetId required', requestId: ctx.requestId })
  }
  const proj = await getProject(projectId)
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
  const asset = proj.assets.find((a) => a.id === assetId)
  if (!asset) return res.status(404).json({ error: 'Asset not found', requestId: ctx.requestId })

  // marcar necessidade de regen e debitar crÃ©ditos
  await updateAsset(projectId, assetId, { status: 'needs_regen' })

  const cost = PRICING.REGENERATE_IMAGE // 30 credits per image

  // debitar crÃ©ditos de regen (2 por asset)
  const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')
  if (!vip) {
    try {
      await spendCredits(session.userId, cost, 'regenerate_image', { projectId, renderId: assetId })
    } catch (err) {
      ctx.log('warn', 'assets.regen.insufficient_credits')
      return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
    }
  }

  const finalPrompt = prompt || asset.prompt
  const apiKey = process.env.GEMINI_API_KEY || ''
  const modelId = 'gemini-2.5-flash-image'

  let dataUrl = ''
  try {
    dataUrl = await generateImageDataUrl({ apiKey, model: modelId, prompt: finalPrompt, ctx })
  } catch (err) {
    ctx.log('error', 'assets.regen.no_image', { message: (err as Error).message })
    return res.status(500).json({ error: 'Image generation failed', requestId: ctx.requestId })
  }

  await updateAsset(projectId, assetId, {
    prompt: finalPrompt,
    status: 'generated',
    dataUrl,
    createdAt: Date.now(),
  })

  const refreshed = await getProject(projectId)
  let balance = await getBalance(session.userId)
  
  // Override balance for Admin/VIPs
  if (session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')) {
    balance = 99999
  }

  ctx.log('info', 'assets.regen.ok', { projectId, assetId, cost, balance })
  const refreshedAsset = refreshed?.assets.find((a) => a.id === assetId) || asset
  return res.status(200).json({ project: refreshed || proj, asset: refreshedAsset, cost, balance, requestId: ctx.requestId })
})

