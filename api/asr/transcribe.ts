import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withObservability } from '../_lib/observability.js'
import { getSessionFromRequest } from '../_lib/auth.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  ctx.userId = session.userId

  const baseUrl = process.env.ASR_BASE_URL
  if (!baseUrl) {
    return res.status(400).json({ error: 'ASR_BASE_URL not configured', requestId: ctx.requestId })
  }

  let body: any = {}
  try {
    body = req.body || {}
  } catch {}

  const audioUrl = String(body.audioUrl || '')
  const language = body.language ? String(body.language) : 'pt'
  const model = body.model ? String(body.model) : 'small'

  if (!audioUrl) {
    return res.status(400).json({ error: 'audioUrl required', requestId: ctx.requestId })
  }

  const token = process.env.ASR_TOKEN

  try {
    const startedAt = Date.now()
    const ac = new AbortController()
    const timeout = setTimeout(() => ac.abort(), 180_000)

    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/transcribe`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ audioUrl, language, model }),
    })

    clearTimeout(timeout)

    const text = await resp.text()
    if (!resp.ok) {
      ctx.log('warn', 'asr.transcribe_failed', { status: resp.status, body: text.slice(0, 500) })
      return res.status(502).json({ error: 'ASR transcribe failed', details: text.slice(0, 500), requestId: ctx.requestId })
    }

    const json = JSON.parse(text)

    ctx.log('info', 'asr.transcribe_ok', { ms: Date.now() - startedAt })

    return res.status(200).json({ ...json, requestId: ctx.requestId })
  } catch (err) {
    const msg = (err as Error).message || String(err)
    ctx.log('error', 'asr.transcribe_error', { message: msg })
    return res.status(502).json({ error: msg, requestId: ctx.requestId })
  }
})
