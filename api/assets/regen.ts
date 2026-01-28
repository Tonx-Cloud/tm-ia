import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { getGemini } from '../_lib/geminiClient.js'
import { getProject, upsertProject } from '../_lib/projectStore.js'
import { getBalance, spendCredits } from '../_lib/credits.js'
import { PRICING } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
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
  const proj = getProject(projectId)
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
  const asset = proj.assets.find((a) => a.id === assetId)
  if (!asset) return res.status(404).json({ error: 'Asset not found', requestId: ctx.requestId })

  // marcar necessidade de regen e debitar créditos
  asset.status = 'needs_regen'
  upsertProject(proj)

  const cost = PRICING.REGENERATE_IMAGE // 30 credits per image

  // debitar créditos de regen (2 por asset)
  try {
    spendCredits(session.userId, cost, 'regenerate_image', { projectId, renderId: assetId })
  } catch (err) {
    ctx.log('warn', 'assets.regen.insufficient_credits')
    return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
  }

  const finalPrompt = prompt || asset.prompt
  const gemini = getGemini()
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' })
  const resp = await model.generateContent([{ text: `${finalPrompt}. Add subtle watermark text: DEMO ASSET.` }])
  const image = resp.response.candidates?.[0]?.content?.parts?.[0]?.inlineData
  if (!image?.data) {
    ctx.log('error', 'assets.regen.no_image')
    return res.status(500).json({ error: 'Image generation failed', requestId: ctx.requestId })
  }
  const dataUrl = `data:${image.mimeType};base64,${image.data}`

  asset.prompt = finalPrompt
  asset.status = 'generated'
  asset.dataUrl = dataUrl
  asset.createdAt = Date.now()

  upsertProject(proj)
  const balance = getBalance(session.userId)
  ctx.log('info', 'assets.regen.ok', { projectId, assetId, cost, balance })
  return res.status(200).json({ project: proj, asset, cost, balance, requestId: ctx.requestId })
})
