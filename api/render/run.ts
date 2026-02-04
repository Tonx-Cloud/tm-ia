import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv, loadJwtEnv } from '../_lib/env.js'
import { startFFmpegRender, type RenderFormat, type RenderOptions } from '../_lib/ffmpegWorker.js'
import { prisma } from '../_lib/prisma.js'
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
    quality: (options as any)?.quality || 'standard',
    watermark: options?.watermark ?? false,
    crossfade: options?.crossfade ?? false,
    crossfadeDuration: options?.crossfadeDuration ?? 0.5,
  }

  ctx.log('info', 'render.run.start', { renderId, opts })

  function clean(v?: string): string {
    return String(v || '')
      .trim()
      .replace(/[\r\n]+/g, '')
  }

  // If a VM worker is configured, delegate rendering to it (preferred for production).
  const renderBaseUrl = clean(process.env.RENDER_BASE_URL || process.env.ASR_BASE_URL)
  const workerToken = clean(process.env.RENDER_TOKEN || process.env.ASR_TOKEN)

  if (renderBaseUrl) {
    const base = renderBaseUrl.replace(/\/$/, '')

    const publicBase = clean(process.env.PUBLIC_BASE_URL)

    // Mark as processing and note delegation.
    await prisma.render.updateMany({
      where: { id: renderId, userId },
      data: {
        status: 'processing',
        progress: 5,
        logTail: `Delegated to VM worker: ${base}\nPUBLIC_BASE_URL=${publicBase || '(empty)'}`,
      },
    })

    const payloadUrl = `${publicBase}/api/render/worker/payload`
    const callbackUrl = `${publicBase}/api/render/worker/callback`

    const resp = await fetch(`${base}/render`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(workerToken ? { Authorization: `Bearer ${workerToken}` } : {}),
      },
      body: JSON.stringify({
        userId,
        renderId,
        payloadUrl,
        callbackUrl,
      }),
    })

    const txt = await resp.text()
    if (!resp.ok) {
      await prisma.render.updateMany({
        where: { id: renderId, userId },
        data: {
          status: 'failed',
          progress: 100,
          error: `Worker render failed: ${resp.status} ${txt.slice(0, 500)}`,
        },
      })
      return res.status(502).json({ error: 'Worker render failed', details: txt.slice(0, 500), requestId: ctx.requestId })
    }

    ctx.log('info', 'render.run.delegated', { renderId, base })
    return res.status(200).json({ ok: true, delegated: true, requestId: ctx.requestId })
  }

  // Fallback: serverless ffmpeg render (deprecated for production)
  await startFFmpegRender(userId, job as any, opts)

  ctx.log('info', 'render.run.done', { renderId })
  return res.status(200).json({ ok: true, requestId: ctx.requestId })
})
