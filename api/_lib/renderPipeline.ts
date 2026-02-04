import { prisma } from './prisma.js'
import { startFFmpegRender, cleanupRenderJob, type RenderOptions, type RenderFormat } from './ffmpegWorker.js'

export type RenderJobStatus = 'pending' | 'processing' | 'complete' | 'failed'

export type RenderJob = {
  renderId: string
  projectId: string
  configId: string
  status: RenderJobStatus
  progress: number
  outputUrl?: string
  error?: string
  logTail?: string
  createdAt: number
  updatedAt: number
}

export { type RenderOptions, type RenderFormat, cleanupRenderJob, cleanupOldRenders } from './ffmpegWorker.js'

export type CreateRenderJobParams = {
  renderId: string
  projectId: string
  configId: string
  outputUrl?: string
  error?: string
}

export type CreateRenderJobOptions = {
  format?: RenderFormat
  watermark?: boolean
  crossfade?: boolean
  crossfadeDuration?: number
}

function mapRow(r: any): RenderJob {
  return {
    renderId: r.id,
    projectId: r.projectId,
    configId: r.configId || 'inline',
    status: r.status,
    progress: r.progress ?? 0,
    outputUrl: r.outputUrl || undefined,
    error: r.error || undefined,
    logTail: r.logTail || undefined,
    createdAt: r.createdAt.getTime(),
    updatedAt: r.updatedAt.getTime(),
  }
}

export async function createRenderJob(userId: string, job: CreateRenderJobParams, _options: CreateRenderJobOptions = {}) {
  const row = await prisma.render.create({
    data: {
      id: job.renderId,
      projectId: job.projectId,
      userId,
      configId: job.configId,
      status: 'pending',
      progress: 0,
      outputUrl: job.outputUrl,
      error: job.error,
    },
  })

  return mapRow(row)
}

export async function getRenderJob(userId: string, renderId: string): Promise<RenderJob | null> {
  const row = await prisma.render.findFirst({ where: { id: renderId, userId } })
  return row ? mapRow(row) : null
}

export async function listRenderJobs(
  userId: string,
  status?: RenderJobStatus,
  limit = 20,
  projectId?: string
) {
  const rows = await prisma.render.findMany({
    where: {
      userId,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map(mapRow)
}

export async function deleteRenderJob(userId: string, renderId: string): Promise<boolean> {
  const row = await prisma.render.findFirst({ where: { id: renderId, userId } })
  if (!row) return false
  await prisma.render.delete({ where: { id: renderId } })
  cleanupRenderJob(renderId)
  return true
}

// For serverless: rendering is triggered via /api/render/run.
export async function runRenderJob(userId: string, renderId: string, options: RenderOptions) {
  const job = await getRenderJob(userId, renderId)
  if (!job) throw new Error('Job not found')
  await startFFmpegRender(userId, job as any, options)
}
