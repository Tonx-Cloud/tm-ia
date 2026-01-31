import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { estimateRenderCost } from '../_lib/pricing.js'
import { getRenderConfig } from './config.js'
import { withObservability } from '../_lib/observability.js'
import { createRenderJob, getRenderJob, type RenderFormat } from '../_lib/renderPipeline.js'
import { upsertProject, getProject } from '../_lib/projectStore.js'
import { putBufferToR2 } from '../_lib/r2.js'
import Busboy from 'busboy'
import path from 'path'
import os from 'os'
import fs from 'fs'
import crypto from 'crypto'

/**
 * Estimate render cost using new pricing model
 */
function estimateCost(duration: number, quality: string, scenesCount: number, animationSeconds = 0) {
  return estimateRenderCost({
    duration,
    quality,
    scenesCount,
    hasAnimation: animationSeconds > 0,
    animationSeconds,
  })
}

function mapAspectRatioToFormat(aspectRatio: string): RenderFormat {
  switch (aspectRatio) {
    case '9:16':
      return 'vertical'
    case '1:1':
      return 'square'
    case '16:9':
    default:
      return 'horizontal'
  }
}

export const config = {
  api: {
    bodyParser: false, // Enable manual parsing for multipart
  },
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  // Parse Body:
  // - Preferred: JSON (no audio upload; use project's stored audioUrl)
  // - Legacy: multipart/form-data (audio + data)
  let audioPath = ''
  let audioFilename = ''
  let audioMime = ''
  let jsonData: any = {}

  const contentType = String(req.headers['content-type'] || '')

  if (contentType.includes('application/json')) {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk as any))
      jsonData = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
    } catch (err) {
      return res.status(400).json({ error: 'Invalid JSON body', requestId: ctx.requestId })
    }
  } else {
    try {
      await new Promise<void>((resolve, reject) => {
        const bb = Busboy({ headers: req.headers, limits: { fileSize: 50 * 1024 * 1024 } })

        bb.on('file', (name, file, info) => {
          if (name === 'audio') {
            const tmpDir = os.tmpdir()
            audioFilename = info.filename || 'audio.mp3'
            audioMime = info.mimeType || ''
            audioPath = path.join(tmpDir, `${crypto.randomUUID()}-${audioFilename}`)
            file.pipe(fs.createWriteStream(audioPath))
          } else {
            file.resume()
          }
        })

        bb.on('field', (name, val) => {
          if (name === 'data') {
            try {
              jsonData = JSON.parse(val)
            } catch {}
          }
          // Support legacy flattened fields if needed, but prefer 'data' JSON
          if (!jsonData.projectId && name === 'projectId') jsonData.projectId = val
        })

        bb.on('finish', resolve)
        bb.on('error', reject)
        req.pipe(bb)
      })
    } catch (err) {
      return res.status(400).json({ error: 'Upload failed: ' + (err as Error).message, requestId: ctx.requestId })
    }
  }

  const { projectId, cost, configId, config: inlineConfig, renderOptions, idempotencyKey, storyboard: explicitStoryboard } = jsonData

  if (!projectId) {
    return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })
  }

  // Ensure project exists and has assets before starting render job
  let project = await getProject(projectId)
  if (!project) {
    // If re-uploading audio, we might create it, but if no assets -> fail
    if (!audioPath) {
      return res.status(400).json({ error: 'Project expired or missing. Please create a new video.', requestId: ctx.requestId })
    }
    project = {
      id: projectId,
      createdAt: Date.now(),
      assets: [],
      storyboard: [],
      renders: [],
    }
  }

  // CRITICAL FIX: If frontend sends an explicit storyboard, verify and persist it immediately.
  // This avoids race conditions where the render job starts before the background sync finishes.
  if (explicitStoryboard && Array.isArray(explicitStoryboard)) {
    project.storyboard = explicitStoryboard
    ctx.log('info', 'render.pro.storyboard_updated_from_payload', { projectId, count: explicitStoryboard.length })
    await upsertProject(project)
  }

  // If we didn't receive audio in this request, we rely on the previously uploaded Blob audioUrl.
  if (!audioPath && !project.audioUrl && !project.audioData) {
    return res.status(400).json({ error: 'Audio missing for this project. Please re-upload the audio.', requestId: ctx.requestId })
  }

  // Persist audio for render across serverless invocations.
  // Prefer Blob URL (keeps size small). Fallback to base64 if blob upload fails.
  if (audioPath) {

    try {
      const buf = fs.readFileSync(audioPath)

      // Upload to Cloudflare R2 (public url)
      const key = `audio/${projectId}/${crypto.randomUUID()}-${audioFilename || 'audio.mp3'}`
      const obj = await putBufferToR2(key, buf, audioMime || undefined)

      project.audioUrl = obj.url
      project.audioFilename = audioFilename || project.audioFilename
      project.audioMime = audioMime || project.audioMime
      project.audioPath = audioPath // dev/debug only

      ctx.log('info', 'render.pro.audio_blob_ok', { projectId, key })
    } catch (err) {
      // Fallback: inline base64 (may be heavy; prefer blob)
      try {
        const buf = fs.readFileSync(audioPath)
        project.audioData = Buffer.from(buf).toString('base64')
        project.audioFilename = audioFilename || project.audioFilename
        project.audioMime = audioMime || project.audioMime
        project.audioPath = audioPath // keep for debug
        ctx.log('warn', 'render.pro.audio_blob_failed_base64_fallback', { message: (err as Error).message })
      } catch (err2) {
        ctx.log('warn', 'render.pro.audio_read_failed', { message: (err2 as Error).message })
      }
    }

    await upsertProject(project)
  }

  if (!project.assets || project.assets.length === 0) {
    return res.status(400).json({ error: 'Project has no scenes to render. Please regenerate scenes.', requestId: ctx.requestId })
  }

  // Get config from configId or inline
  let cfg = configId ? getRenderConfig(configId) : undefined
  if (!cfg && inlineConfig && inlineConfig.duration) {
    const est = estimateCost(inlineConfig.duration, inlineConfig.quality || 'high', inlineConfig.scenesCount || 10)
    cfg = {
      id: 'inline',
      projectId,
      estimatedCredits: est,
      format: inlineConfig.format || 'horizontal',
      duration: inlineConfig.duration,
      scenesCount: inlineConfig.scenesCount,
      stylePrompt: inlineConfig.stylePrompt,
      aspectRatio: inlineConfig.aspectRatio,
      quality: inlineConfig.quality,
      createdAt: Date.now(),
    }
  }

  const amount = cfg?.estimatedCredits ?? (typeof cost === 'number' && cost > 0 ? cost : 30)

  // Seed demo balance in dev if empty
  if (await getBalance(session.userId) === 0) {
    await addCredits(session.userId, 50, 'initial')
  }

  // FORCE VIP BALANCE
  if (session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')) {
    const current = await getBalance(session.userId)
    if (current < 99999) await addCredits(session.userId, 99999 - current, 'admin_adjust')
  }

  const renderId = idempotencyKey
    ? `render_${crypto.createHash('sha256').update(`${session.userId}:${String(idempotencyKey)}`).digest('hex').slice(0, 24)}`
    : crypto.randomUUID()

  // Idempotency: if this renderId already exists, return it (and avoid double-charge).
  const existing = await getRenderJob(session.userId, renderId)
  if (existing) {
    const balance = await getBalance(session.userId)
    ctx.log('info', 'render.pro.idempotent_hit', { projectId, renderId })
    return res.status(200).json({
      ok: true,
      cost: amount,
      balance,
      renderId: existing.renderId,
      status: existing.status,
      outputUrl: existing.outputUrl,
      progress: existing.progress,
      requestId: ctx.requestId,
    })
  }

  try {
    await spendCredits(session.userId, amount, 'pro_render', { projectId, renderId })
  } catch (err) {
    return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
  }

  const balance = await getBalance(session.userId)

  // Determine render format (authoritative source: aspectRatio)
  // Do not rely on renderOptions.format coming from the client.
  const ar = (inlineConfig?.aspectRatio || cfg?.aspectRatio || project.aspectRatio || '16:9') as string
  const format: RenderFormat = mapAspectRatioToFormat(ar)

  await createRenderJob(
    session.userId,
    {
      renderId,
      projectId,
      configId: cfg?.id || configId || 'inline',
      outputUrl: undefined,
      error: undefined,
    },
    {
      format,
      watermark: renderOptions?.watermark ?? false,
      crossfade: renderOptions?.crossfade ?? false,
      crossfadeDuration: renderOptions?.crossfadeDuration ?? 0.5,
    }
  )

  // Trigger render in a separate invocation (reliable on serverless)
  try {
    const jwtEnv = loadEnv()
    const host = (req.headers['x-forwarded-host'] as string) || (req.headers['host'] as string) || ''
    const proto = ((req.headers['x-forwarded-proto'] as string) || 'https').split(',')[0]
    
    // Robust URL detection for Vercel
    let baseUrl = jwtEnv.PUBLIC_BASE_URL
    if (!baseUrl) {
      if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
        baseUrl = `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      } else if (process.env.VERCEL_URL) {
        baseUrl = `https://${process.env.VERCEL_URL}`
      } else if (host) {
        baseUrl = `${proto}://${host}`
      }
    }

    if (baseUrl) {
      ctx.log('info', 'render.pro.trigger', { baseUrl, renderId })
      // Fire and forget, but log error if fails
      fetch(`${baseUrl}/api/render/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-internal-render-secret': jwtEnv.JWT_SECRET,
        },
        body: JSON.stringify({
          userId: session.userId,
          renderId,
          options: {
            format,
            quality: (renderOptions as any)?.quality || 'standard',
            watermark: renderOptions?.watermark ?? false,
            crossfade: renderOptions?.crossfade ?? false,
            crossfadeDuration: renderOptions?.crossfadeDuration ?? 0.5,
          },
        }),
      }).catch((err) => {
         console.error('Failed to trigger render:', err)
      })
    } else {
        console.error('Could not determine base URL for render trigger')
    }
  } catch {
    // best-effort
  }

  ctx.log('info', 'render.pro.started', { projectId, amount, balance, renderId })

  return res.status(200).json({
    ok: true,
    cost: amount,
    balance: session.email === 'hiltonsf@gmail.com' || session.email.includes('felipe') ? 99999 : balance,
    configId: cfg?.id,
    renderId,
    status: 'pending',
    format,
    requestId: ctx.requestId,
  })
})
