import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv, loadJwtEnv } from '../_lib/env.js'
import { startFFmpegRender, type RenderFormat, type RenderOptions } from '../_lib/ffmpegWorker.js'
import { getRenderJob } from '../_lib/renderPipeline.js'
import { withObservability } from '../_lib/observability.js'

// Internal endpoint to execute a render job in its own invocation.
// This avoids "background" work after the response in serverless.

export const config = {
  maxDuration: 300,
}

type Body = {
  userId: string
  renderId: string
  options?: RenderOptions
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  // Internal auth
  const secret = (req.headers['x-internal-render-secret'] as string) || ''
  const jwtEnv = loadJwtEnv()
  if (!secret || secret !== jwtEnv.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', requestId: ctx.requestId })
  }

  const { userId, renderId, options } = (req.body ?? {}) as Body
  if (!userId || !renderId) {
    return res.status(400).json({ error: 'userId and renderId required', requestId: ctx.requestId })
  }

  ctx.userId = userId

  const job = await getRenderJob(userId, renderId)
  if (!job) {
    return res.status(404).json({ error: 'Render not found', requestId: ctx.requestId })
  }

  // normalize options
  const opts: RenderOptions = {
    format: options?.format || ('horizontal' as RenderFormat),
    watermark: options?.watermark ?? false,
    crossfade: options?.crossfade ?? false,
    crossfadeDuration: options?.crossfadeDuration ?? 0.5,
  }

  ctx.log('info', 'render.run.start', { renderId, opts })

  // Run render (updates job progress/errors internally)
  await startFFmpegRender(userId, job as any, opts)

  ctx.log('info', 'render.run.done', { renderId })
  return res.status(200).json({ ok: true, requestId: ctx.requestId })
})
