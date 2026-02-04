import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { VeoClient } from '../_lib/veo.js'
import { spendCredits, getBalance } from '../_lib/credits.js'
import { withObservability } from '../_lib/observability.js'
import { getProject, getAsset, updateAsset } from '../_lib/projectStore.js'

function toPublicVideoUrl(uri: string): string {
  if (uri.startsWith('gs://')) {
    const cleaned = uri.replace('gs://', '')
    return `https://storage.googleapis.com/${cleaned}`
  }
  return uri
}

function mapAspectRatio(value: string | undefined): '16:9' | '9:16' {
  if (!value) return '16:9'
  if (value === '9:16') return '9:16'
  return '16:9'
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) return res.status(401).json({ error: 'Auth required' })
  ctx.userId = session.userId

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }

  const { projectId, assetId, prompt } = req.body

  if (!projectId || !assetId) {
    return res.status(400).json({ error: 'Missing projectId or assetId' })
  }

  const project = await getProject(projectId)
  if (!project) return res.status(404).json({ error: 'Project not found' })

  const asset = await getAsset(projectId, assetId)
  if (!asset) return res.status(404).json({ error: 'Asset not found' })

  try {
    if (!process.env.GCLOUD_PROJECT || !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      await updateAsset(projectId, assetId, {
        animation: { status: 'failed', provider: 'veo' },
      } as any)
      return res.status(501).json({ error: 'Veo não configurado (GCS/credenciais ausentes)' })
    }

    // Cost check (50 credits)
    const COST = 50
    const balance = await getBalance(session.userId)

    // VIP bypass
    const vip = session.email === 'hiltonsf@gmail.com'

    if (!vip && balance < COST) {
      return res.status(402).json({ error: 'Insufficient credits', required: COST, balance })
    }

    // Deduct credits
    if (!vip) {
      await spendCredits(session.userId, COST, 'animate_image', { projectId, assetId })
    }

    const veo = new VeoClient()

    // Prepare prompt - use override or fallback to asset prompt
    const finalPrompt = prompt || asset.prompt || 'Cinematic video'

    // If asset.dataUrl is base64, strip prefix
    let imageBase64 = asset.dataUrl || ''
    if (imageBase64.includes(',')) {
      imageBase64 = imageBase64.split(',')[1]
    }

    ctx.log('info', 'veo.start', { projectId, assetId })

    const aspectRatio = mapAspectRatio(project.aspectRatio)

    const result = await veo.generateVideo({
      prompt: finalPrompt,
      imageBase64,
      aspectRatio,
    })

    if (result.videoUrl) {
      const videoUrl = toPublicVideoUrl(result.videoUrl)
      await updateAsset(projectId, assetId, {
        animation: {
          status: 'completed',
          videoUrl,
          jobId: `inline-${Date.now()}`,
          provider: 'veo',
        },
      } as any)

      return res.status(200).json({
        status: 'completed',
        jobId: `inline-${Date.now()}`,
        balance: await getBalance(session.userId),
        videoUrl,
      })
    }

    if (result.operationName) {
      await updateAsset(projectId, assetId, {
        animation: {
          status: 'pending',
          jobId: result.operationName,
          provider: 'veo',
        },
      } as any)

      return res.status(200).json({
        status: 'pending',
        jobId: result.operationName,
        balance: await getBalance(session.userId),
      })
    }

    return res.status(500).json({ error: 'Veo response missing operation or video URL' })

  } catch (err) {
    ctx.log('error', 'veo.error', { message: (err as Error).message })
    return res.status(500).json({ error: 'Animation failed', details: (err as Error).message })
  }
})
