import { PrismaClient } from '@prisma/client'
import { startFFmpegRender } from './api/_lib/ffmpegWorker.js'
import { generateImageDataUrl } from './api/_lib/geminiImage.js'
import dotenv from 'dotenv'

// Load env
dotenv.config()
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient()
const POLL_INTERVAL = 2000 // 2 seconds

async function checkImageJobs() {
  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) return

  const job = await prisma.imageJob.findFirst({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
  })

  if (!job) return

  await prisma.imageJob.update({ where: { id: job.id }, data: { status: 'processing' } })

  try {
    const asset = await prisma.asset.findFirst({ where: { id: job.assetId, projectId: job.projectId } })
    if (!asset) throw new Error('Asset not found')

    const dataUrl = await generateImageDataUrl({ apiKey, model: job.modelId, prompt: asset.prompt })

    await prisma.asset.update({
      where: { id: asset.id },
      data: { dataUrl, status: 'generated' },
    })

    await prisma.imageJob.update({ where: { id: job.id }, data: { status: 'complete', error: null } })
  } catch (err) {
    await prisma.imageJob.update({ where: { id: job.id }, data: { status: 'failed', error: (err as Error).message } })
  }
}

async function checkRenderQueue() {
  try {
    // Find first pending job
    const job = await prisma.render.findFirst({
      where: { status: 'pending' },
      include: { project: true },
      orderBy: { createdAt: 'asc' }
    })

    if (!job) return // No jobs

    console.log(`Found job ${job.id} (Project: ${job.projectId})`)

    // Sanity check: ensure project has assets
    if (!job.project) {
        console.error('Project not found for job')
        await prisma.render.update({ where: { id: job.id }, data: { status: 'failed', error: 'Project not found' } })
        return
    }

    // Mock the RenderJob type expected by worker
    const renderJob: any = {
        renderId: job.id,
        projectId: job.projectId,
        configId: job.configId || 'inline',
        status: 'pending',
        progress: 0,
        createdAt: job.createdAt.getTime(),
        updatedAt: Date.now()
    }

    // Determine options based on config (or defaults)
    const options = {
        format: 'horizontal', // default
        watermark: false,
        crossfade: false,
        crossfadeDuration: 0.5,
    }

    // Run render locally
    console.log('Starting render...')
    await startFFmpegRender(job.userId || 'system', renderJob, options as any)
    console.log('Render finished processing logic.')

    // The startFFmpegRender updates the DB status internally.
    // We just need to check if it succeeded.
    const updated = await prisma.render.findUnique({ where: { id: job.id } })
    if (updated?.status === 'complete') {
        console.log(`✅ Job ${job.id} COMPLETED! URL: ${updated.outputUrl}`)
    } else if (updated?.status === 'failed') {
        console.log(`❌ Job ${job.id} FAILED: ${updated.error}`)
    }

  } catch (err) {
    console.error('Worker loop error:', err)
  }
}

async function main() {
  console.log('🚀 Worker Started')
  console.log('Watching: ImageJobs + RenderJobs')
  console.log('Press Ctrl+C to stop')

  while (true) {
    try {
      await checkImageJobs()
    } catch {}
    await checkRenderQueue()
    await new Promise(r => setTimeout(r, POLL_INTERVAL))
  }
}

main()
