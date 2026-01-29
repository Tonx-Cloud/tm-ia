import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { getSession } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { getRenderJob, cleanupRenderJob } from '../_lib/renderPipeline.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 60, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  const { jobId, renderId, cleanup } = req.query as { jobId?: string; renderId?: string; cleanup?: string }
  const id = renderId || jobId // Support both for backwards compatibility

  if (!id) {
    return res.status(400).json({ error: 'renderId required', requestId: ctx.requestId })
  }

  const job = await getRenderJob(session.userId, id)
  if (!job) {
    return res.status(404).json({ error: 'Job not found', requestId: ctx.requestId })
  }

  // DELETE method: cleanup files for a job
  if (req.method === 'DELETE') {
    if (job.status === 'processing') {
      return res.status(400).json({ error: 'Cannot delete job in progress', requestId: ctx.requestId })
    }
    const cleaned = cleanupRenderJob(id)
    ctx.log('info', 'download.cleanup', { renderId: id, cleaned })
    return res.status(200).json({ ok: true, cleaned, requestId: ctx.requestId })
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })
  }

  if (job.status !== 'complete') {
    return res.status(400).json({ error: 'Job not ready', status: job.status, requestId: ctx.requestId })
  }

  // If the job output is a Blob URL, redirect.
  if (job.outputUrl && /^https?:\/\//i.test(job.outputUrl)) {
    ctx.log('info', 'download.redirect', { renderId: id })
    return res.status(302).setHeader('Location', job.outputUrl).end()
  }

  // Construct file path
  const tmpDir = os.tmpdir()
  const workDir = path.join(tmpDir, `render_${id}`)
  const filePath = path.join(workDir, 'output.mp4')

  if (!fs.existsSync(filePath)) {
    ctx.log('error', 'download.file_missing', { renderId: id, filePath })
    return res.status(404).json({ error: 'File expired or missing', requestId: ctx.requestId })
  }

  const stat = fs.statSync(filePath)
  const fileSize = stat.size
  const range = req.headers.range

  ctx.log('info', 'download.serving', { renderId: id, fileSize, hasRange: !!range })

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-')
    const start = parseInt(parts[0], 10)
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1
    const chunksize = end - start + 1
    const file = fs.createReadStream(filePath, { start, end })
    const head = {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
      'Content-Disposition': `inline; filename="tm-ia-${id}.mp4"`,
    }
    res.writeHead(206, head)
    file.pipe(res)
  } else {
    const head = {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': `inline; filename="tm-ia-${id}.mp4"`,
    }
    res.writeHead(200, head)
    
    const stream = fs.createReadStream(filePath)
    stream.pipe(res)
    
    // Optional: cleanup after download if requested
    if (cleanup === 'true') {
      stream.on('end', () => {
        setTimeout(() => {
          cleanupRenderJob(id)
          ctx.log('info', 'download.cleanup_after', { renderId: id })
        }, 5000) // Wait 5 seconds before cleanup
      })
    }
  }
})
