import { prisma } from './prisma.js'

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
    updatedAt: r.updatedAt?.getTime?.() ?? r.createdAt.getTime(),
  }
}

export async function loadJobs(userId: string): Promise<RenderJob[]> {
  const rows = await prisma.render.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  return rows.map(mapRow)
}

export async function saveJobs(_userId: string, _jobs: RenderJob[]) {
  // no-op: jobs are stored individually in DB.
}

export async function upsertJob(userId: string, job: RenderJob) {
  await prisma.render.upsert({
    where: { id: job.renderId },
    create: {
      id: job.renderId,
      projectId: job.projectId,
      userId,
      configId: job.configId,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      error: job.error,
      logTail: job.logTail,
    },
    update: {
      configId: job.configId,
      status: job.status,
      progress: job.progress,
      outputUrl: job.outputUrl,
      error: job.error,
      logTail: job.logTail,
    },
  })
}
