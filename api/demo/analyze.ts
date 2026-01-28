import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { getOpenAI } from '../_lib/openaiClient.js'
import { ensureTempFile } from '../_lib/storage.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { PRICING, calculateTranscriptionCost } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'

// ============================================================================
// AUDIO ANALYSIS ENDPOINT
// ============================================================================
// CRITICAL: This endpoint handles transcription and hook detection.
// 
// Flow:
// 1. Validate auth and body params (projectId, filePath, durationSeconds)
// 2. Check/spend credits
// 3. Resolve temp file path (supports Windows and Linux paths)
// 4. Call OpenAI transcription API
// 5. Call OpenAI for hook/mood/genre analysis
// 6. Return transcription, hookText, mood, genre to frontend
//
// The frontend (StepWizard) expects these fields in the response:
// - transcription: string (the full transcribed text)
// - hookText: string (the detected hook/chorus)
// - mood: string (e.g., "energetic", "melancholic")
// - genre: string (e.g., "pop", "rock")
// - balance: number (updated credit balance)
//
// DO NOT MODIFY the response structure without updating StepWizard!
// ============================================================================

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { filePath, projectId, durationSeconds } = req.body as { filePath?: string; projectId?: string; durationSeconds?: number }
  
  ctx.log('info', 'demo.analyze.start', { projectId, filePath, durationSeconds })
  
  if (!projectId || !filePath) {
    ctx.log('warn', 'demo.analyze.invalid_body', { projectId, filePath })
    return res.status(400).json({ error: 'projectId and filePath required', requestId: ctx.requestId })
  }

  // Calculate cost: transcription + analysis
  const audioDuration = durationSeconds ?? 180 // Default 3 min if not provided
  const transcriptionCost = calculateTranscriptionCost(audioDuration)
  const analysisCost = PRICING.ANALYSIS_HOOK
  const totalCost = transcriptionCost + analysisCost

  // Seed demo balance if empty
  if (getBalance(session.userId) === 0) {
    addCredits(session.userId, 50, 'initial')
  }

  // Check and spend credits
  try {
    spendCredits(session.userId, totalCost, 'analysis', { projectId })
  } catch (err) {
    ctx.log('warn', 'analyze.insufficient_credits', { balance: getBalance(session.userId), cost: totalCost })
    return res.status(402).json({ 
      error: 'Insufficient credits', 
      required: totalCost,
      breakdown: { transcription: transcriptionCost, analysis: analysisCost },
      balance: getBalance(session.userId),
      requestId: ctx.requestId 
    })
  }

  let resolved: string
  try {
    resolved = ensureTempFile(filePath)
    ctx.log('info', 'demo.analyze.file_resolved', { resolved })
  } catch (err) {
    ctx.log('error', 'demo.analyze.file_error', { filePath, error: (err as Error).message })
    return res.status(400).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  try {
    const openai = getOpenAI()
    
    // Step 1: Transcription
    ctx.log('info', 'demo.analyze.transcribing')
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(path.resolve(resolved)),
      model: 'gpt-4o-transcribe',
      response_format: 'text',
    })

    const text = (transcription as any).text ?? (transcription as any) ?? ''
    ctx.log('info', 'demo.analyze.transcribed', { textLength: text.length })
    
    // Step 2: Hook/mood/genre analysis
    const prompt = `Given this song transcript, identify the strongest chorus/hook within 5 seconds of audio. Return JSON strictly as {"hookText":string,"startSec":number,"endSec":number,"summary":string,"mood":string,"genre":string}. Transcript: ${text}`

    ctx.log('info', 'demo.analyze.analyzing_hook')
    const analysis = await openai.responses.create({
      model: 'gpt-4o-mini',
      input: [{ role: 'user', content: prompt }],
      max_output_tokens: 120,
    })

    let content = (analysis.output_text as string) ?? '{}'
    
    // Strip markdown code blocks if present (```json ... ```)
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    
    let payload: {
      hookText: string
      startSec: number
      endSec: number
      summary?: string
      mood?: string
      genre?: string
    }
    
    try {
      payload = JSON.parse(content)
    } catch (parseErr) {
      ctx.log('warn', 'demo.analyze.parse_error', { content })
      // Fallback if AI response is malformed
      payload = {
        hookText: text.slice(0, 50) || 'Instrumental',
        startSec: 0,
        endSec: 5,
        mood: 'energetic',
        genre: 'pop'
      }
    }

    const balance = getBalance(session.userId)
    ctx.log('info', 'demo.analyze.ok', { 
      projectId, 
      cost: totalCost, 
      balance,
      transcriptionLength: text.length,
      hookText: payload.hookText?.slice(0, 30)
    })
    
    // IMPORTANT: These fields must match what StepWizard expects
    return res.status(200).json({
      projectId,
      status: 'ready',
      transcription: text,
      hookText: payload.hookText || '',
      hookStart: payload.startSec || 0,
      hookEnd: payload.endSec || 5,
      hookConfidence: 0.6,
      summary: payload.summary || '',
      mood: payload.mood || 'energetic',
      genre: payload.genre || 'pop',
      cost: totalCost,
      breakdown: { transcription: transcriptionCost, analysis: analysisCost },
      balance,
      requestId: ctx.requestId,
    })
  } catch (err) {
    ctx.log('error', 'demo.analyze.error', { message: (err as Error).message, stack: (err as Error).stack })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }
})
