import fs from 'fs'
import path from 'path'
import os from 'os'

export type RenderJobStatus = 'pending' | 'processing' | 'complete' | 'failed'

export type RenderJob = {
  renderId: string
  projectId: string
  configId: string
  status: RenderJobStatus
  progress: number // 0-100
  outputUrl?: string
  error?: string
  createdAt: number
  updatedAt: number
}

function storePath(userId: string) {
  return path.join(os.tmpdir(), `render_jobs_${userId}.json`)
}

export function loadJobs(userId: string): RenderJob[] {
  const p = storePath(userId)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as RenderJob[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveJobs(userId: string, jobs: RenderJob[]) {
  fs.writeFileSync(storePath(userId), JSON.stringify(jobs, null, 2))
}
