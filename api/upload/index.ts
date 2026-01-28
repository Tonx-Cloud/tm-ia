import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Buffer } from 'node:buffer'
import Busboy from 'busboy'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { loadEnv } from '../_lib/env.js'
import { getSession } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { createLogger } from '../_lib/logger.js'
import { createProject, upsertProject } from '../_lib/projectStore.js'

export const config = {
  api: {
    bodyParser: false,
  },
}

const MAX_FILE = 15 * 1024 * 1024 // 15MB audio

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  const logger = createLogger({ requestId: ctx.requestId })

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = getSession(req)
  if (!session) {
    logger.warn('auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId
  logger.child({ userId: session.userId })

  const rate = checkRateLimit(req, { limit: 10, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  if (req.headers.expect) {
    logger.info('upload.expect_header_ignored')
    delete (req.headers as any).expect
  }

  try {
    loadEnv()
  } catch (err) {
    logger.error('env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const contentType = req.headers['content-type'] || ''
  if (typeof contentType !== 'string' || !contentType.includes('boundary=')) {
    return res.status(400).json({ error: 'Missing multipart boundary', requestId: ctx.requestId })
  }

  const projectId = `demo-${Date.now()}`
  let gotAudio = false
  let size = 0
  let filename = 'audio'
  let mime = ''
  let tmpPath = ''

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE, files: 1 } })
      const filePromises: Promise<void>[] = []
      let rejected = false

      const rejectOnce = (err: Error) => {
        if (rejected) return
        rejected = true
        reject(err)
      }

      bb.on('file', (fieldname: string, file: any, info: { filename: string; encoding: string; mimeType: string }) => {
        const { filename: incomingName, mimeType } = info
        const allowedField = fieldname === 'audio' || fieldname === 'file'
        if (!allowedField || !mimeType || !mimeType.startsWith('audio/')) {
          file.resume()
          return
        }
        gotAudio = true
        filename = incomingName || 'audio'
        mime = mimeType
        const tmpDir = os.tmpdir()
        tmpPath = path.join(tmpDir, `${crypto.randomUUID()}-${path.basename(filename)}`)
        const out = fs.createWriteStream(tmpPath)

        const p = new Promise<void>((res, rej) => {
          file.on('data', (chunk: Buffer) => {
            size += chunk.length
          })
          file.on('limit', () => {
            rej(Object.assign(new Error('File too large'), { status: 413 }))
          })
          file.on('error', (err: Error) => {
            rej(err)
          })
          out.on('error', (err) => rej(err))
          out.on('finish', () => res())
        })

        file.pipe(out)
        filePromises.push(p)
      })

      bb.on('finish', async () => {
        try {
          await Promise.all(filePromises)
          resolve()
        } catch (err) {
          rejectOnce(err as Error)
        }
      })

      bb.on('error', (err: Error) => {
        rejectOnce(err)
      })

      bb.on('filesLimit', () => {
        rejectOnce(Object.assign(new Error('Too many files'), { status: 400 }))
      })

      req.on('aborted', () => rejectOnce(new Error('Request aborted')))
      req.on('error', (err) => rejectOnce(err as Error))

      req.pipe(bb)
    })
  } catch (err) {
    const message = (err as Error).message || 'Upload failed'
    const status = (err as any).status === 413 ? 413 : 400
    return res.status(status).json({ error: message, requestId: ctx.requestId })
  }

  if (!gotAudio) {
    return res.status(400).json({ error: 'Audio file is required', requestId: ctx.requestId })
  }

  // Create project and save audio path
  const project = createProject()
  project.audioPath = tmpPath
  upsertProject(project)

  logger.info('upload.ok', { size, mime, projectId: project.id })
  // Normalize path to forward slashes for cross-platform compatibility
  const normalizedPath = tmpPath.replace(/\\/g, '/')
  return res.status(200).json({ ok: true, projectId: project.id, filePath: normalizedPath, filename, size, mime, requestId: ctx.requestId })
})
