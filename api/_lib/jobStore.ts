import { createClient } from 'redis'

// Reuse Redis client from projectStore logic or create new
const redisUrl = process.env.REDIS_URL
const client = redisUrl ? createClient({ url: redisUrl }) : null

if (client) {
  client.on('error', (err) => console.error('Redis Client Error', err))
  if (!client.isOpen) client.connect().catch(console.error)
}

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

const MEMORY_JOBS: Record<string, RenderJob[]> = {}

async function getRedis() {
  if (!client) return null
  if (!client.isOpen) await client.connect()
  return client
}

// NOTE: Changed to async
export async function loadJobs(userId: string): Promise<RenderJob[]> {
  const redis = await getRedis()
  if (redis) {
    const data = await redis.get(`jobs:${userId}`)
    return data ? JSON.parse(data) : []
  }
  return MEMORY_JOBS[userId] || []
}

// NOTE: Changed to async
export async function saveJobs(userId: string, jobs: RenderJob[]) {
  const redis = await getRedis()
  if (redis) {
    await redis.set(`jobs:${userId}`, JSON.stringify(jobs), { EX: 86400 * 3 }) // 3 days retention
  } else {
    MEMORY_JOBS[userId] = jobs
  }
}
