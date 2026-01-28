import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { getProject, upsertProject } from '../_lib/projectStore.js'
import { loadEnv } from '../_lib/env.js'
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

  const { projectId, assetId } = req.body as { projectId?: string; assetId?: string }
  if (!projectId || !assetId) {
    ctx.log('warn', 'assets.reuse.invalid_body')
    return res.status(400).json({ error: 'projectId and assetId required', requestId: ctx.requestId })
  }
  const proj = getProject(projectId)
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
  const asset = proj.assets.find((a) => a.id === assetId)
  if (!asset) return res.status(404).json({ error: 'Asset not found', requestId: ctx.requestId })
  asset.status = 'reused'
  upsertProject(proj)
  ctx.log('info', 'assets.reuse.ok', { projectId, assetId })
  return res.status(200).json({ project: proj, requestId: ctx.requestId })
})
