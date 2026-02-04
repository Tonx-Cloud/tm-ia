import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv, loadJwtEnv } from '../../_lib/env.js'
import { getRenderJob } from '../../_lib/renderPipeline.js'
import { getProject } from '../../_lib/projectStore.js'
import { withObservability } from '../../_lib/observability.js'

// Internal endpoint used by the VM worker to fetch the exact render payload.
// Auth: header `x-internal-render-secret` == JWT_SECRET

export const config = {
  maxDuration: 60,
}

type Body = {
  userId: string
  renderId: string
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const secret = (req.headers['x-internal-render-secret'] as string) || ''
  const jwtEnv = loadJwtEnv()
  if (!secret || secret !== jwtEnv.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', requestId: ctx.requestId })
  }

  const { userId, renderId } = (req.body ?? {}) as Body
  if (!userId || !renderId) {
    return res.status(400).json({ error: 'userId and renderId required', requestId: ctx.requestId })
  }

  ctx.userId = userId

  const job = await getRenderJob(userId, renderId)
  if (!job) return res.status(404).json({ error: 'Render not found', requestId: ctx.requestId })

  const project = await getProject(job.projectId)
  if (!project) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

  // Return only what the worker needs (keep this stable).
  return res.status(200).json({
    requestId: ctx.requestId,
    renderId: job.renderId,
    projectId: job.projectId,
    audioUrl: project.audioUrl,
    storyboard: project.storyboard || [],
    assets: (project.assets || []).map((a: any) => ({
      id: a.id,
      dataUrl: a.dataUrl,
      animation: a.animationStatus
        ? {
            status: a.animationStatus,
            videoUrl: a.animationVideoUrl,
          }
        : null,
      fileKey: a.fileKey || null,
    })),
  })
})
