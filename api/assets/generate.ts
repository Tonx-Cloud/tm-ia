import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { getGemini } from '../_lib/geminiClient.js'
import { addAssets, getProject, createProject, type Asset } from '../_lib/projectStore.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'
import { getActionCost } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'

type Segment = {
  startTime: number
  endTime: number
  text: string
  type: 'lyrics' | 'instrumental' | 'silence'
}

type GenerateRequest = {
  projectId: string
  segments: Segment[]
  style: string
  mood: string
  genre: string
  aspectRatio: '9:16' | '16:9' | '1:1'
  frequency: number // seconds per image
}

// Legacy payload (older web client)
type LegacyGenerateRequest = {
  prompt: string
  count: number
  projectId?: string
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  
  const session = getSession(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 5, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const body = req.body as GenerateRequest | LegacyGenerateRequest

  // ---- Legacy mode support (prompt/count) ----
  if ((body as LegacyGenerateRequest).prompt && typeof (body as LegacyGenerateRequest).count === 'number') {
    const { prompt, count } = body as LegacyGenerateRequest
    if (!prompt || count <= 0) {
      return res.status(400).json({ error: 'prompt and count required', requestId: ctx.requestId })
    }

    // Ensure project exists
    let projectId = (body as LegacyGenerateRequest).projectId
    let project = projectId ? await getProject(projectId) : null
    if (!project) {
      project = await createProject()
      projectId = project.id
    }

    // Seed credits if empty (dev/demo)
    if ((await getBalance(session.userId)) === 0) {
      await addCredits(session.userId, 50, 'initial')
    }

    const assets: Asset[] = Array.from({ length: Math.min(24, count) }).map(() => ({
      id: crypto.randomUUID(),
      projectId: projectId!,
      prompt,
      status: 'needs_regen',
      dataUrl: '',
      createdAt: Date.now(),
    }))

    const updatedProject = await addAssets(projectId!, assets)
    const balance = await getBalance(session.userId)

    ctx.log('info', 'assets.generate.legacy.ok', { projectId, count: assets.length })
    return res.status(200).json({ project: updatedProject, added: assets.length, cost: 0, balance, requestId: ctx.requestId })
  }

  // ---- New mode (segments/storyboard) ----
  const { projectId, segments, style, mood, genre, aspectRatio, frequency } = body as GenerateRequest

  if (!projectId || !segments || segments.length === 0) {
    return res.status(400).json({ error: 'projectId and segments required', requestId: ctx.requestId })
  }

  const project = await getProject(projectId)
  if (!project) {
    return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
  }

  // Calculate total duration and number of images
  const totalDuration = segments.length > 0 
    ? Math.max(...segments.map(s => s.endTime))
    : 180
  const imageCount = Math.max(4, Math.min(24, Math.ceil(totalDuration / frequency)))
  const cost = getActionCost('GENERATE_IMAGE', imageCount)

  // Check/add credits
  if ((await getBalance(session.userId)) === 0) {
    await addCredits(session.userId, 50, 'initial')
  }

  // VIP/admin bypass (shows 99999 credits on UI)
  const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')
  if (!vip) {
    try {
      await spendCredits(session.userId, cost, 'generate_image', { projectId })
    } catch (err) {
      ctx.log('warn', 'assets.generate.insufficient_credits', { balance: await getBalance(session.userId) })
      return res.status(402).json({ 
        error: 'Insufficient credits', 
        required: cost,
        balance: await getBalance(session.userId),
        requestId: ctx.requestId 
      })
    }
  }

  // Get resolution based on aspect ratio
  const resolutions: Record<string, { width: number; height: number }> = {
    '9:16': { width: 576, height: 1024 },
    '16:9': { width: 1024, height: 576 },
    '1:1': { width: 1024, height: 1024 }
  }
  const resolution = resolutions[aspectRatio] || resolutions['16:9']

  // Create time slots for images
  const timeSlots: { start: number; end: number; lyrics: string }[] = []
  const slotDuration = totalDuration / imageCount
  
  for (let i = 0; i < imageCount; i++) {
    const start = i * slotDuration
    const end = (i + 1) * slotDuration
    
    // Find lyrics that overlap with this time slot
    const overlappingSegments = segments.filter(seg => 
      seg.startTime < end && seg.endTime > start && seg.type === 'lyrics'
    )
    const lyrics = overlappingSegments.map(s => s.text).join(' ').trim() || '[instrumental]'
    
    timeSlots.push({ start, end, lyrics })
  }

  // Generate cinematic prompts using Gemini
  const gemini = getGemini()
  const model = gemini.getGenerativeModel({ model: 'gemini-1.5-flash' })

  const roteirizationPrompt = `You are a music video director. Create a visual storyboard for a music video.

SONG METADATA:
- Style: ${style}
- Mood: ${mood}
- Genre: ${genre}
- Aspect Ratio: ${aspectRatio}

SCENES TO CREATE (${imageCount} scenes):
${timeSlots.map((slot, i) => `
Scene ${i + 1} (${formatTime(slot.start)} - ${formatTime(slot.end)}):
Lyrics: "${slot.lyrics}"
`).join('')}

For EACH scene, create a detailed image generation prompt that:
1. Captures the EMOTION of the lyrics (not literal interpretation)
2. Uses ${style} visual style consistently
3. Maintains visual continuity between scenes
4. Includes lighting, camera angle, color palette
5. Is optimized for AI image generation (Midjourney/DALL-E style)

Return ONLY a JSON array with exactly ${imageCount} objects:
[
  {
    "sceneNumber": 1,
    "timeCode": "0:00-0:15",
    "lyrics": "the lyrics for this part",
    "prompt": "detailed image generation prompt...",
    "visualNotes": "brief description of the scene"
  }
]`

  let storyboard: Array<{
    sceneNumber: number
    timeCode: string
    lyrics: string
    prompt: string
    visualNotes: string
  }> = []

  try {
    const resp = await model.generateContent([{ text: roteirizationPrompt }])
    const textContent = resp.response.candidates?.[0]?.content?.parts?.[0]?.text || ''
    
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = textContent
    const codeBlockMatch = textContent.match(/```(?:json)?\s*([\s\S]*?)```/)
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1]
    }
    const jsonMatch = jsonStr.match(/\[[\s\S]*\]/)
    if (jsonMatch) {
      storyboard = JSON.parse(jsonMatch[0])
    }
  } catch (err) {
    ctx.log('warn', 'assets.generate.storyboard_error', { error: (err as Error).message })
  }

  // Fallback if AI fails
  if (storyboard.length < imageCount) {
    const fallbackStyles: Record<string, string[]> = {
      cinematic: [
        'Cinematic wide shot, dramatic lighting, film grain, anamorphic lens flare',
        'Close-up portrait, shallow depth of field, golden hour lighting',
        'Aerial establishing shot, epic scale, moody atmosphere',
        'Silhouette against dramatic sky, backlit, emotional'
      ],
      anime: [
        'Anime style, vibrant colors, detailed background, Studio Ghibli inspired',
        'Manga panel composition, dynamic lines, expressive character',
        'Anime landscape, cherry blossoms, soft lighting, dreamy',
        'Anime portrait, detailed eyes, flowing hair, emotional expression'
      ],
      cyberpunk: [
        'Cyberpunk cityscape, neon lights, rain reflections, Blade Runner style',
        'Futuristic portrait, holographic elements, tech noir aesthetic',
        'Neon-lit alley, steam, dramatic shadows, sci-fi atmosphere',
        'Digital interface overlay, glitch effects, high-tech mood'
      ],
      watercolor: [
        'Watercolor painting, soft washes, delicate textures, artistic',
        'Impressionist landscape, flowing colors, dreamy atmosphere',
        'Abstract watercolor, emotional color palette, artistic blur',
        'Watercolor portrait, soft edges, artistic interpretation'
      ],
      minimal: [
        'Minimalist composition, negative space, clean lines, modern',
        'Simple geometric shapes, muted colors, elegant design',
        'Minimal landscape, fog, solitude, contemplative mood',
        'Abstract minimal, single focal point, sophisticated'
      ],
      neon: [
        'Neon glow, vibrant pink and blue, dark background, 80s aesthetic',
        'Synthwave landscape, grid lines, sunset gradient, retro futurism',
        'Neon portrait, colorful rim lighting, vaporwave style',
        'Glowing elements, electric atmosphere, night scene'
      ]
    }

    const stylePrompts = fallbackStyles[style] || fallbackStyles.cinematic
    
    for (let i = storyboard.length; i < imageCount; i++) {
      const slot = timeSlots[i]
      storyboard.push({
        sceneNumber: i + 1,
        timeCode: `${formatTime(slot.start)}-${formatTime(slot.end)}`,
        lyrics: slot.lyrics,
        prompt: `${stylePrompts[i % stylePrompts.length]}, ${mood} mood, ${genre} music video, ${slot.lyrics !== '[instrumental]' ? `inspired by: "${slot.lyrics}"` : 'instrumental break, abstract visual'}`,
        visualNotes: `Scene ${i + 1} - ${style} style`
      })
    }
  }

  // Generate images (using placeholder for now, would use real image API in production)
  const assets: Asset[] = []
  
  for (let i = 0; i < imageCount; i++) {
    const scene = storyboard[i]
    const seed = Date.now() + i + Math.random() * 1000
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
    } catch (err) {
      ctx.log('warn', 'assets.generate.image_fetch_failed', { index: i })
    }
    
    assets.push({
      id: crypto.randomUUID(),
      projectId,
      prompt: scene.prompt,
      status: 'generated',
      dataUrl,
      createdAt: Date.now(),
      // Extended metadata
      ...({
        sceneNumber: scene.sceneNumber,
        timeCode: scene.timeCode,
        lyrics: scene.lyrics,
        visualNotes: scene.visualNotes
      } as any)
    })
  }

  const updatedProject = await addAssets(projectId, assets)
  let balance = await getBalance(session.userId)

  // Override balance for Admin/VIPs
  if (session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')) {
    balance = 99999
  }

  ctx.log('info', 'assets.generate.ok', { 
    projectId, 
    imageCount, 
    cost, 
    balance,
    style,
    aspectRatio 
  })

  return res.status(200).json({ 
    project: updatedProject, 
    storyboard,
    added: imageCount, 
    cost,
    balance,
    requestId: ctx.requestId 
  })
})

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}
