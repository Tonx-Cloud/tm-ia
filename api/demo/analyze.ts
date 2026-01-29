import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import Busboy from 'busboy'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { getOpenAI } from '../_lib/openaiClient.js'
import { createProject, upsertProject, getProject } from '../_lib/projectStore.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { PRICING, calculateTranscriptionCost } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'

// ============================================================================
// AUDIO ANALYSIS ENDPOINT (Unified Upload + Analyze)
// ============================================================================

export const config = {
  api: {
    bodyParser: false, // Disable default body parser to handle multipart
  },
}

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

  // 1. Handle Multipart Upload (Busboy)
  let filePath = ''
  let projectId = `proj-${Date.now()}`
  let durationSeconds = 180 // Default

  try {
    await new Promise<void>((resolve, reject) => {
      const bb = Busboy({ headers: req.headers, limits: { fileSize: 25 * 1024 * 1024 } }) // 25MB limit
      
      bb.on('file', (name, file, info) => {
        if (name === 'audio') {
          const tmpDir = os.tmpdir()
          filePath = path.join(tmpDir, `${crypto.randomUUID()}-${info.filename || 'audio.mp3'}`)
          file.pipe(fs.createWriteStream(filePath))
        } else {
          file.resume()
        }
      })

      bb.on('field', (name, val) => {
        if (name === 'projectId' && val) projectId = val
        if (name === 'durationSeconds') durationSeconds = parseInt(val) || 180
      })

      bb.on('finish', resolve)
      bb.on('error', reject)
      req.pipe(bb)
    })
  } catch (err) {
    return res.status(400).json({ error: 'Upload failed: ' + (err as Error).message })
  }

  if (!filePath || !fs.existsSync(filePath)) {
    return res.status(400).json({ error: 'No audio file uploaded' })
  }

  // Ensure project exists/is created in store
  let project = await getProject(projectId)
  if (!project) {
    project = {
      id: projectId,
      createdAt: Date.now(),
      assets: [],
      storyboard: [],
      renders: [],
      audioPath: filePath
    }
    await upsertProject(project)
  }

  ctx.log('info', 'demo.analyze.start', { projectId, filePath, durationSeconds })

  // 2. Cost Calculation & Credits
  const transcriptionCost = calculateTranscriptionCost(durationSeconds)
  const analysisCost = PRICING.ANALYSIS_HOOK
  const totalCost = transcriptionCost + analysisCost

  if (await getBalance(session.userId) === 0) {
    await addCredits(session.userId, 50, 'initial')
  }

  const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')
  if (!vip) {
    try {
      await spendCredits(session.userId, totalCost, 'analysis', { projectId })
    } catch (err) {
      return res.status(402).json({ 
        error: 'Insufficient credits', 
        required: totalCost,
        balance: await getBalance(session.userId) 
      })
    }
  }

  try {
    const openai = getOpenAI()
    
    // 3. Transcription
    ctx.log('info', 'demo.analyze.transcribing')
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
      model: 'whisper-1', // Reverted to Whisper-1 for stability
      response_format: 'text',
    })

    const text = (transcription as any).text ?? (transcription as any) ?? ''
    
    // 4. Hook Analysis
    // If transcript is large, create a short summary first to avoid huge prompts
    let transcriptForPrompt = text
    let truncated = false
    const MAX_TRANSCRIPT_CHARS = 4000
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true
      // Ask a small/cheap model to summarize the transcript concisely
      const summarization = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'You are a concise summarizer. Produce a short summary (<=800 chars) of the transcript focusing on chorus/hook markers, repeated lines, and main themes.' },
          { role: 'user', content: `Please summarize the following transcript in <=800 characters:\n\n${text.slice(0, MAX_TRANSCRIPT_CHARS)}` }
        ],
        max_tokens: 800,
      })
      const sumContent = summarization.choices?.[0]?.message?.content || ''
      transcriptForPrompt = (sumContent + '\n\n(Transcript truncated)')
    }

    const prompt = `Given this song transcript (or its summary), identify the strongest chorus/hook. Return JSON strictly as {"hookText":string,"startSec":number,"endSec":number,"summary":string,"mood":string,"genre":string}. Transcript/Summary: ${transcriptForPrompt}`

    const analysis = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    })

    let content = analysis.choices[0]?.message?.content || '{}'
    content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    
    let payload = {
      hookText: text.slice(0, 50) || 'Instrumental',
      startSec: 0,
      endSec: 5,
      mood: 'energetic',
      genre: 'pop',
      summary: ''
    }
    
    try {
      const parsed = JSON.parse(content)
      payload = { ...payload, ...parsed }
    } catch {}

    // Cleanup temp file
    try { fs.unlinkSync(filePath) } catch {}

    let balance = await getBalance(session.userId)
    
    // Override balance for Admin/VIPs
    if (session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')) {
      balance = 99999
    }
    
    return res.status(200).json({
      projectId,
      status: 'ready',
      transcription: text,
      hookText: payload.hookText,
      hookStart: payload.startSec,
      hookEnd: payload.endSec,
      summary: payload.summary,
      mood: payload.mood,
      genre: payload.genre,
      cost: totalCost,
      balance,
      requestId: ctx.requestId,
    })

  } catch (err) {
    ctx.log('error', 'demo.analyze.error', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }
})
