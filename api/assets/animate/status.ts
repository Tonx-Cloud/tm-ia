import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withObservability } from '../../_lib/observability.js'

// Simple status endpoint for future polling
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

    const { jobId } = req.query
    if (!jobId) return res.status(400).json({ error: 'Missing jobId' })

    // In the future, this would check Redis/DB/Vertex for job status
    // For now, if it's a mock job, it's always done.

    if (String(jobId).startsWith('mock-')) {
        return res.status(200).json({
            status: 'completed',
            videoUrl: 'https://cdn.pixabay.com/video/2024/02/09/199958-911694865_large.mp4'
        })
    }

    return res.status(404).json({ error: 'Job not found' })
})
