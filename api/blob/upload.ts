import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { withObservability } from '../_lib/observability.js'
import { presignPutToR2 } from '../_lib/r2.js'

// Client-side uploads for large audio files.
// The browser requests a presigned URL here; the file then uploads directly to Cloudflare R2.

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const body = (req.body || {}) as { pathname?: string; contentType?: string }
  const pathname = String(body.pathname || '')
  const contentType = String(body.contentType || '')

  if (!pathname || !pathname.startsWith('audio/')) {
    return res.status(400).json({ error: 'Invalid upload path', requestId: ctx.requestId })
  }
  if (!contentType || !contentType.startsWith('audio/')) {
    return res.status(400).json({ error: 'Invalid contentType', requestId: ctx.requestId })
  }

  const signed = await presignPutToR2(pathname, contentType, 15 * 60)
  ctx.log('info', 'r2.presign.ok', { key: signed.key })

  return res.status(200).json({
    ok: true,
    uploadUrl: signed.uploadUrl,
    publicUrl: signed.publicUrl,
    key: signed.key,
    requestId: ctx.requestId,
  })
})
