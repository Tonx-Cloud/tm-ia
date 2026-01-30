import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { getProject, addAssets, type Asset } from '../_lib/projectStore.js'

function slugify(s: string) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'projeto'
}

function formatStamp(ms: number) {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function makeFileKey(projectName: string | undefined, createdAtMs: number, sceneNumber: number, assetId: string) {
  const proj = slugify(projectName || '')
  const short = String(assetId).replace(/-/g, '').slice(0, 8)
  const s = String(sceneNumber).padStart(2, '0')
  return `tmia__${proj}__${formatStamp(createdAtMs)}__s${s}__${short}`
}

import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

type Segment = {
  startTime: number
  endTime: number
  text: string
  type: 'lyrics' | 'instrumental' | 'silence'
}

type AddSceneRequest = {
  projectId: string
  segments: Segment[]
  style: string
  mood: string
  genre: string
  aspectRatio: '9:16' | '16:9' | '1:1'
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function getResolution(aspectRatio: AddSceneRequest['aspectRatio']) {
  if (aspectRatio === '9:16') return { width: 1080, height: 1920 }
  if (aspectRatio === '1:1') return { width: 1080, height: 1080 }
  return { width: 1920, height: 1080 }
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 10, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { projectId, segments, style, mood, genre, aspectRatio } = (req.body ?? {}) as AddSceneRequest
  if (!projectId) return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })

  const project = await getProject(projectId)
  if (!project) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

  const sceneNumber = (project.assets?.length || 0) + 1

  // pick a lyric segment near the end (or fallback)
  const totalDuration = segments?.length ? Math.max(...segments.map((s) => s.endTime)) : 180
  const targetTime = Math.max(0, totalDuration - 5)
  const seg = (segments || []).find((s) => s.startTime <= targetTime && s.endTime >= targetTime) || segments?.[segments.length - 1]
  const lyrics = seg?.text?.trim() ? seg.text.trim() : '[instrumental]'

  const timeStart = Math.max(0, totalDuration - 5)
  const timeEnd = totalDuration

  const fallbackStyles: Record<string, string[]> = {
    cinematic: [
      'Cinematic shot, dramatic lighting, film still, high detail',
      'Wide establishing shot, cinematic color grading, moody atmosphere',
      'Close-up portrait, shallow depth of field, cinematic bokeh'
    ],
    anime: [
      'Anime style, vibrant colors, detailed character design, dynamic lighting',
      'Studio anime key visual, cel shading, crisp lineart',
      'Anime scene, dramatic perspective, expressive mood'
    ],
    cyberpunk: [
      'Cyberpunk city at night, neon lights, rain, futuristic atmosphere',
      'Futuristic portrait, holographic elements, tech noir aesthetic',
      'Neon-lit alley, steam, dramatic shadows, sci-fi atmosphere'
    ],
    watercolor: [
      'Watercolor painting, soft washes, delicate textures, artistic',
      'Impressionist landscape, flowing colors, dreamy atmosphere',
      'Abstract watercolor, emotional color palette, artistic blur'
    ],
    minimal: [
      'Minimalist composition, negative space, clean lines, modern',
      'Simple geometric shapes, muted colors, elegant design',
      'Minimal landscape, fog, solitude, contemplative mood'
    ],
    neon: [
      'Neon glow, vibrant pink and blue, dark background, 80s aesthetic',
      'Synthwave landscape, grid lines, sunset gradient, retro futurism',
      'Neon portrait, colorful rim lighting, vaporwave style'
    ]
  }

  const stylePrompts = fallbackStyles[style] || fallbackStyles.cinematic
  const base = stylePrompts[sceneNumber % stylePrompts.length]

  const prompt = `${base}, ${mood} mood, ${genre} music video, ${lyrics !== '[instrumental]' ? `inspired by: "${lyrics}"` : 'instrumental break, abstract visual'}`

  const resolution = getResolution(aspectRatio)
  const seed = Date.now() + Math.random() * 1000
  const imageUrl = `https://picsum.photos/seed/${Math.floor(seed)}/${resolution.width}/${resolution.height}`

  let dataUrl = imageUrl
  try {
    const imgResp = await fetch(imageUrl)
    if (imgResp.ok) {
      const buffer = await imgResp.arrayBuffer()
      const base64 = Buffer.from(buffer).toString('base64')
      const contentType = imgResp.headers.get('content-type') || 'image/jpeg'
      dataUrl = `data:${contentType};base64,${base64}`
    }
  } catch {
    ctx.log('warn', 'assets.add.image_fetch_failed')
  }

  const id = crypto.randomUUID()
  const createdAt = Date.now()

  const asset: Asset = {
    id,
    projectId,
    prompt,
    status: 'generated',
    dataUrl,
    fileKey: makeFileKey(project.name, createdAt, sceneNumber, id),
    createdAt,
    sceneNumber,
    timeCode: `${formatTime(timeStart)}-${formatTime(timeEnd)}`,
    lyrics,
    visualNotes: `Scene ${sceneNumber} - ${style} style`,
  }

  const updatedProject = await addAssets(projectId, [asset])

  // Return a storyboard-like entry for UI
  const storyboardScene = {
    sceneNumber,
    timeCode: asset.timeCode,
    lyrics: asset.lyrics,
    prompt: asset.prompt,
    visualNotes: asset.visualNotes,
  }

  ctx.log('info', 'assets.add.ok', { projectId, assetId: asset.id, sceneNumber })
  return res.status(200).json({ ok: true, asset, project: updatedProject, storyboardScene, requestId: ctx.requestId })
})
