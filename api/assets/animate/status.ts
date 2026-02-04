import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withObservability } from '../../_lib/observability.js'
import { VeoClient } from '../../_lib/veo.js'
import { updateAsset } from '../../_lib/projectStore.js'

function toPublicVideoUrl(uri: string): string {
  if (uri.startsWith('gs://')) {
    const cleaned = uri.replace('gs://', '')
    return `https://storage.googleapis.com/${cleaned}`
  }
  return uri
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, _ctx) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const { jobId, projectId, assetId } = req.query as { jobId?: string; projectId?: string; assetId?: string }
  if (!jobId) return res.status(400).json({ error: 'Missing jobId' })

  try {
    if (!process.env.GCLOUD_PROJECT || !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
      return res.status(501).json({ error: 'Veo não configurado (GCS/credenciais ausentes)' })
    }

    const veo = new VeoClient()
    const op = await veo.checkOperation(String(jobId))

    if (op.error) {
      if (projectId && assetId) {
        await updateAsset(projectId, assetId, {
          animation: { status: 'failed', jobId: String(jobId), provider: 'veo' },
        } as any)
      }
      return res.status(200).json({ status: 'failed', error: op.error.message })
    }

    if (!op.done) {
      return res.status(200).json({ status: 'pending' })
    }

    const videoUri = op.response?.generatedSamples?.[0]?.video?.uri
    if (!videoUri) {
      return res.status(200).json({ status: 'failed', error: 'Missing video URI in response' })
    }

    const videoUrl = toPublicVideoUrl(videoUri)

    if (projectId && assetId) {
      await updateAsset(projectId, assetId, {
        animation: { status: 'completed', jobId: String(jobId), provider: 'veo', videoUrl },
      } as any)
    }

    return res.status(200).json({ status: 'completed', videoUrl })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message })
  }
})
