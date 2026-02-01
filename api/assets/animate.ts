import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../../_lib/auth.js'
import { loadEnv } from '../../_lib/env.js'
import { VeoClient } from '../../_lib/veo.js'
import { spendCredits, getBalance } from '../../_lib/credits.js'
import { getActionCost } from '../../_lib/pricing.js'
import { withObservability } from '../../_lib/observability.js'
import { getProject, getAsset, updateAsset } from '../../_lib/projectStore.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

    const session = getSession(req)
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

    // Cost check (50 credits)
    const COST = 50
    const balance = await getBalance(session.userId)

    // VIP bypass
    const vip = session.email === 'hiltonsf@gmail.com' || session.email.toLowerCase().includes('felipe')

    if (!vip && balance < COST) {
        return res.status(402).json({ error: 'Insufficient credits', required: COST, balance })
    }

    // Deduct credits
    if (!vip) {
        await spendCredits(session.userId, COST, 'animate_image', { projectId, assetId })
    }

    try {
        const veo = new VeoClient()

        // Prepare prompt - use override or fallback to asset prompt
        const finalPrompt = prompt || asset.prompt || 'Cinematic video'

        // Call Veo API
        // Note: We need to handle the image. 
        // If asset.dataUrl is base64, we strip the prefix.
        let imageBase64 = asset.dataUrl || ''
        if (imageBase64.includes(',')) {
            imageBase64 = imageBase64.split(',')[1]
        }

        // TODO: Ideally we should use GCS URI if we have it, but for now try base64
        // If Veo requires GCS, we might fail here unless we upload first.
        // For MVP, we'll try to find a way to pass bytes or implement upload later.
        // Assuming VeoClient handles logic or we assume user has GCS configured.

        ctx.log('info', 'veo.start', { projectId, assetId })

        // For now, MOCK the response if no GCLOUD_PROJECT key to avoid crashing in dev without keys
        if (!process.env.GCLOUD_PROJECT && !process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
            // MOCK MODE
            await new Promise(r => setTimeout(r, 2000))

            await updateAsset(projectId, assetId, {
                animation: {
                    status: 'completed',
                    videoUrl: 'https://cdn.pixabay.com/video/2024/02/09/199958-911694865_large.mp4', // Mock video
                    cost: COST,
                    provider: 'mock-veo'
                }
            } as any)

            return res.status(200).json({
                status: 'completed',
                jobId: 'mock-job-' + Date.now(),
                balance: await getBalance(session.userId),
                videoUrl: 'https://cdn.pixabay.com/video/2024/02/09/199958-911694865_large.mp4'
            })
        }

        // Real call would go here
        // const op = await veo.generateVideo({ prompt: finalPrompt, imageBase64 })
        // Return Pending status

        return res.status(501).json({ error: 'Veo integration pending GCS setup' })

    } catch (err) {
        ctx.log('error', 'veo.error', { message: (err as Error).message })
        // Refund? Maybe. For now, just error.
        return res.status(500).json({ error: 'Animation failed', details: (err as Error).message })
    }
})
