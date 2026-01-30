import dotenv from 'dotenv'
import { PrismaClient } from '@prisma/client'
import { generateImageDataUrl } from '../api/_lib/geminiImage.js'

dotenv.config()
dotenv.config({ path: '.env.local' })

const prisma = new PrismaClient()

async function loop() {
  const apiKey = process.env.GEMINI_API_KEY || ''
  if (!apiKey) {
    console.error('GEMINI_API_KEY missing')
    process.exit(1)
  }

  while (true) {
    const job = await prisma.imageJob.findFirst({
      where: { status: 'pending' },
      orderBy: { createdAt: 'asc' },
    })

    if (!job) {
      await new Promise((r) => setTimeout(r, 1500))
      continue
    }

    await prisma.imageJob.update({ where: { id: job.id }, data: { status: 'processing' } })

    try {
      const asset = await prisma.asset.findFirst({ where: { id: job.assetId, projectId: job.projectId } })
      if (!asset) throw new Error('Asset not found')

      const dataUrl = await generateImageDataUrl({
        apiKey,
        model: job.modelId,
        prompt: asset.prompt,
      })

      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          dataUrl,
          status: 'generated',
        },
      })

      await prisma.imageJob.update({ where: { id: job.id }, data: { status: 'complete', error: null } })
    } catch (err) {
      await prisma.imageJob.update({
        where: { id: job.id },
        data: { status: 'failed', error: (err as Error).message },
      })
    }
  }
}

loop().finally(async () => prisma.$disconnect())
