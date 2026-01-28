import { type RenderJob, loadJobs, saveJobs, type RenderJobStatus } from './jobStore.js'
import { startFFmpegRender, cleanupRenderJob, cleanupOldRenders, type RenderOptions, type RenderFormat } from './ffmpegWorker.js'

export { type RenderJob, type RenderJobStatus } from './jobStore.js'
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

export function createRenderJob(
  userId: string,
  job: CreateRenderJobParams,
  options: CreateRenderJobOptions = {}
) {
  const jobs = loadJobs(userId)
  const newJob: RenderJob = {
    ...job,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  jobs.push(newJob)
  saveJobs(userId, jobs)

  // Trigger async render with options
  const renderOptions: RenderOptions = {
    format: options.format || 'horizontal',
    watermark: options.watermark ?? false,
    crossfade: options.crossfade ?? false,
    crossfadeDuration: options.crossfadeDuration ?? 0.5,
  }
  startFFmpegRender(userId, newJob, renderOptions)

  return newJob
}

export function getRenderJob(userId: string, renderId: string): RenderJob | null {
  return loadJobs(userId).find((j) => j.renderId === renderId) ?? null
}

export function listRenderJobs(userId: string, status?: RenderJobStatus, limit = 20) {
  let jobs = loadJobs(userId)
  if (status) jobs = jobs.filter((j) => j.status === status)
  return jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export function deleteRenderJob(userId: string, renderId: string): boolean {
  const jobs = loadJobs(userId)
  const idx = jobs.findIndex((j) => j.renderId === renderId)
  if (idx >= 0) {
    jobs.splice(idx, 1)
    saveJobs(userId, jobs)
    cleanupRenderJob(renderId)
    return true
  }
  return false
}
