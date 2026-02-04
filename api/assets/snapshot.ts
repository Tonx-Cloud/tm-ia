import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSessionFromRequest } from '../_lib/auth.js'
import { getProject, upsertProject, type Project } from '../_lib/projectStore.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

function snapshotHash(project: Project) {
  const payload = {
    assets: project.assets.map((a) => ({ id: a.id, prompt: a.prompt, status: a.status, dataLen: a.dataUrl?.length ?? 0 })),
    storyboard: project.storyboard,
  }
  const json = JSON.stringify(payload)
  return crypto.createHash('sha256').update(json).digest('hex')
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const rate = await checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  const { projectId } = req.body as { projectId?: string }
  if (!projectId) return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })

  const proj = await getProject(projectId)
  if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

  const hash = snapshotHash(proj)
  const last = proj.renders[proj.renders.length - 1]
  if (last?.snapshotHash === hash) {
    ctx.log('info', 'assets.snapshot.reuse', { projectId, renderId: last.id })
    return res.status(200).json({ ok: true, reused: true, renderId: last.id, cost: 0, snapshotHash: hash, requestId: ctx.requestId })
  }

  const renderId = crypto.randomUUID()
  proj.renders.push({ id: renderId, createdAt: Date.now(), status: 'ready', costCredits: 0, snapshotHash: hash })
  await upsertProject(proj)
  ctx.log('info', 'assets.snapshot.saved', { projectId, renderId })
  return res.status(200).json({ ok: true, reused: false, renderId, cost: 0, snapshotHash: hash, requestId: ctx.requestId })
})

