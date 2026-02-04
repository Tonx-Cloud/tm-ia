import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { calculateTranscriptionCost } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { getOpenAI } from '../_lib/openaiClient.js'
import { ensureTempFile } from '../_lib/storage.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  ctx.userId = session.userId

  const rateKey = `transcribe:${session.userId}`
  const rate = await checkRateLimit(req, { limit: 5, windowMs: 60_000, key: rateKey, ctx })
  if (!rate.allowed) {
    res.setHeader('Retry-After', String(rate.retryAfterSeconds))
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { filePath, durationSeconds } = req.body as { filePath?: string; durationSeconds?: number }
  if (!filePath) {
    return res.status(400).json({ error: 'filePath required', requestId: ctx.requestId })
  }

  // Calculate cost based on audio duration (default 60s if not provided)
  const duration = durationSeconds ?? 60
  const cost = calculateTranscriptionCost(duration)

  // Seed demo balance if empty
  if ((await getBalance(session.userId)) === 0) {
    await addCredits(session.userId, 50, 'initial')
  }

  // Check and spend credits
  const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')
  if (!vip) {
    try {
      await spendCredits(session.userId, cost, 'transcription')
    } catch (err) {
      ctx.log('warn', 'transcribe.insufficient_credits', { balance: await getBalance(session.userId), cost })
      return res.status(402).json({
        error: 'Insufficient credits',
        required: cost,
        balance: await getBalance(session.userId),
        requestId: ctx.requestId,
      })
    }
  }

  let transcription = ''
  try {
    const safePath = ensureTempFile(filePath)
    const openai = getOpenAI()
    const result = await openai.audio.transcriptions.create({
      file: fs.createReadStream(safePath),
      model: 'whisper-1',
      response_format: 'text',
    })
    transcription = (result as any)?.text ?? (result as any) ?? ''
  } catch (err) {
    ctx.log('error', 'transcribe.failed', { message: (err as Error).message })
    return res.status(500).json({ error: 'Transcription failed', requestId: ctx.requestId })
  }

  const balance = await getBalance(session.userId)
  ctx.log('info', 'transcribe.ok', { filePath, duration, cost, balance })

  return res.status(200).json({
    transcription,
    cost,
    balance,
    requestId: ctx.requestId,
  })
})
