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

export async function createRenderJob(
  userId: string,
  job: CreateRenderJobParams,
  options: CreateRenderJobOptions = {}
) {
  const jobs = await loadJobs(userId)
  const newJob: RenderJob = {
    ...job,
    status: 'pending',
    progress: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }
  jobs.push(newJob)
  await saveJobs(userId, jobs)

  // NOTE: we DO NOT start the render here.
  // On Vercel serverless, work after the response is not reliable.
  // Rendering is triggered by a separate invocation (/api/render/run).
  return newJob
}

export async function getRenderJob(userId: string, renderId: string): Promise<RenderJob | null> {
  const jobs = await loadJobs(userId)
  return jobs.find((j) => j.renderId === renderId) ?? null
}

export async function listRenderJobs(userId: string, status?: RenderJobStatus, limit = 20) {
  let jobs = await loadJobs(userId)
  if (status) jobs = jobs.filter((j) => j.status === status)
  return jobs.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit)
}

export async function deleteRenderJob(userId: string, renderId: string): Promise<boolean> {
  const jobs = await loadJobs(userId)
  const idx = jobs.findIndex((j) => j.renderId === renderId)
  if (idx >= 0) {
    jobs.splice(idx, 1)
    await saveJobs(userId, jobs)
    cleanupRenderJob(renderId)
    return true
  }
  return false
}
