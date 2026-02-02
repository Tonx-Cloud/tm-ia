import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { getRenderJob } from '../_lib/renderPipeline.js'
import { withObservability } from '../_lib/observability.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const { renderId } = req.query as { renderId?: string }
  if (!renderId) return res.status(400).json({ error: 'renderId required', requestId: ctx.requestId })

  const job = await getRenderJob(session.userId, renderId)
  if (!job) return res.status(404).json({ error: 'Render not found', requestId: ctx.requestId })

  return res.status(200).json({ ...job, requestId: ctx.requestId })
})
