import type { VercelRequest, VercelResponse } from '@vercel/node'
import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import Busboy from 'busboy'
import { putBufferToR2 } from '../_lib/r2.js'
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
    // Keep disabled so we can accept both: multipart (file) and JSON (audioUrl)
    bodyParser: false,
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

  // 1) Accept either:
  // - multipart/form-data (field: audio)
  // - JSON body with { audioUrl }
  let filePath = ''
  let audioUrl = ''
  let audioFilename = 'audio.mp3'
  let audioMime = ''
  let projectId = `proj-${Date.now()}`
  let durationSeconds = 180 // Default

  const contentType = String(req.headers['content-type'] || '')

  // JSON path (audioUrl)
  if (contentType.includes('application/json')) {
    try {
      const chunks: Buffer[] = []
      for await (const chunk of req) chunks.push(Buffer.from(chunk))
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')
      if (body.projectId) projectId = String(body.projectId)
      if (body.durationSeconds) durationSeconds = parseInt(String(body.durationSeconds)) || 180
      if (body.audioUrl) audioUrl = String(body.audioUrl)
      if (body.audioFilename) audioFilename = String(body.audioFilename)
      if (body.audioMime) audioMime = String(body.audioMime)
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body', requestId: ctx.requestId })
    }

    if (!audioUrl) {
      return res.status(400).json({ error: 'audioUrl required', requestId: ctx.requestId })
    }

    // Download to tmp for Whisper (with timeout + logs)
    try {
      const startedAt = Date.now()
      const ac = new AbortController()
      const timeout = setTimeout(() => ac.abort(), 25_000)

      const resp = await fetch(audioUrl, { signal: ac.signal })
      clearTimeout(timeout)

      if (!resp.ok) {
        throw new Error(`audioUrl download failed (${resp.status})`)
      }

      const tmpDir = os.tmpdir()
      filePath = path.join(tmpDir, `${crypto.randomUUID()}-${audioFilename || 'audio.mp3'}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      fs.writeFileSync(filePath, buf)

      ctx.log('info', 'demo.analyze.audio_download_ok', {
        projectId,
        ms: Date.now() - startedAt,
        bytes: buf.length,
      })
    } catch (err) {
      const msg = (err as Error).message || String(err)
      ctx.log('warn', 'demo.analyze.audio_download_failed', { projectId, message: msg })
      return res.status(400).json({ error: 'Failed to fetch audioUrl: ' + msg, requestId: ctx.requestId })
    }
  } else {
    // Multipart path (file upload)
    try {
      await new Promise<void>((resolve, reject) => {
        // NOTE: Keep in sync with /api/render/pro upload limits
        const bb = Busboy({ headers: req.headers, limits: { fileSize: 60 * 1024 * 1024 } }) // 60MB limit

        bb.on('file', (name, file, info) => {
          if (name === 'audio') {
            const tmpDir = os.tmpdir()
            audioFilename = info.filename || 'audio.mp3'
            audioMime = info.mimeType || ''
            filePath = path.join(tmpDir, `${crypto.randomUUID()}-${audioFilename}`)
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
      const msg = (err as Error).message || String(err)
      const isTooLarge = /limit|too large|file size/i.test(msg)
      return res.status(isTooLarge ? 413 : 400).json({ error: 'Upload failed: ' + msg, requestId: ctx.requestId })
    }

    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(400).json({ error: 'No audio file uploaded', requestId: ctx.requestId })
    }

    // Upload to Blob so the project can be resumed later without re-uploading.
    try {
      const buf = fs.readFileSync(filePath)
      const key = `audio/${projectId}/${crypto.randomUUID()}-${audioFilename || 'audio.mp3'}`
      const obj = await putBufferToR2(key, buf, audioMime || undefined)
      audioUrl = obj.url
    } catch (err) {
      ctx.log('warn', 'demo.analyze.audio_blob_failed', { message: (err as Error).message })
      // best-effort: continue without audioUrl
    }
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
    }
  }

  // Save audio reference for resume
  project.audioPath = filePath // tmp (best-effort)
  if (audioUrl) project.audioUrl = audioUrl
  if (audioFilename) project.audioFilename = audioFilename
  if (audioMime) project.audioMime = audioMime
  await upsertProject(project)

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
    ctx.log('info', 'demo.analyze.transcribing', { projectId })

    let text = ''

    // Prefer external ASR (VM) if configured; fall back to OpenAI Whisper.
    if (process.env.ASR_BASE_URL && audioUrl) {
      try {
        const startedAt = Date.now()
        const ac = new AbortController()
        const timeout = setTimeout(() => ac.abort(), 180_000)

        const resp = await fetch(`${process.env.ASR_BASE_URL.replace(/\/$/, '')}/transcribe`, {
          method: 'POST',
          signal: ac.signal,
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.ASR_TOKEN ? { Authorization: `Bearer ${process.env.ASR_TOKEN}` } : {}),
          },
          body: JSON.stringify({ audioUrl, language: 'pt', model: 'small' }),
        })

        clearTimeout(timeout)

        const json = await resp.json().catch(() => ({} as any))
        if (resp.ok && json?.text) {
          text = String(json.text)
          ctx.log('info', 'demo.analyze.asr_ok', { projectId, ms: Date.now() - startedAt })
        } else {
          ctx.log('warn', 'demo.analyze.asr_failed', { projectId, status: resp.status, error: json?.error })
        }
      } catch (err) {
        ctx.log('warn', 'demo.analyze.asr_error', { projectId, message: (err as Error).message })
      }
    }

    if (!text) {
      const transcription = await openai.audio.transcriptions.create({
        file: fs.createReadStream(filePath),
        model: 'whisper-1', // Reverted to Whisper-1 for stability
        response_format: 'text',
      })

      text = (transcription as any).text ?? (transcription as any) ?? ''
    }
    
    // 4. Hook Analysis
    // If transcript is large, create a short summary first to avoid huge prompts
    let transcriptForPrompt = text
    let truncated = false
    const MAX_TRANSCRIPT_CHARS = 4000
    if (text.length > MAX_TRANSCRIPT_CHARS) {
      truncated = true
      // Ask a small/cheap model to summarize the transcript concisely (via Vercel AI Gateway)
      try {
        const { gatewayGenerateText } = await import('../_lib/aiGateway.js')
        const { text: sumContent } = await gatewayGenerateText({
          model: 'openai/gpt-4.1-mini',
          prompt:
            'Você é um resumidor conciso. Produza um resumo curto (<=800 chars) focando em refrão/hook, linhas repetidas e temas principais.\n\n' +
            text.slice(0, MAX_TRANSCRIPT_CHARS),
          maxOutputTokens: 800,
          ctx,
        })
        transcriptForPrompt = (sumContent + '\n\n(Transcript truncated)')
      } catch {
        // fallback to OpenAI direct
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
    }

    const prompt = `Given this song transcript (or its summary), identify the strongest chorus/hook. Return JSON strictly as {"hookText":string,"startSec":number,"endSec":number,"summary":string,"mood":string,"genre":string}. Transcript/Summary: ${transcriptForPrompt}`

    let content = '{}'
    try {
      const { gatewayGenerateText } = await import('../_lib/aiGateway.js')
      const r = await gatewayGenerateText({
        model: 'openai/gpt-4.1-mini',
        prompt,
        maxOutputTokens: 250,
        ctx,
      })
      content = r.text || '{}'
    } catch {
      const analysis = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 200,
      })
      content = analysis.choices[0]?.message?.content || '{}'
    }
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
