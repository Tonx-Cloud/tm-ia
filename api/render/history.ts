import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { listRenderJobs } from '../_lib/renderPipeline.js'
import { withObservability } from '../_lib/observability.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const { status, limit } = req.query as { status?: string; limit?: string }
  // advanceAll removed as we now have real async workers
  const renders = await listRenderJobs(session.userId, status as any, limit ? Number(limit) : 20)
  return res.status(200).json({ renders, requestId: ctx.requestId })
})
