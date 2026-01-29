import { createClient } from 'redis'
import crypto from 'crypto'

// Use REDIS_URL from env
const redisUrl = process.env.REDIS_URL
const client = redisUrl ? createClient({ url: redisUrl }) : null

if (client) {
  client.on('error', (err) => console.error('Redis Client Error', err))
  // Connect immediately (top-level await supported in Node 14+ ESM, or lazy connect)
  if (!client.isOpen) client.connect().catch(console.error)
}

export type Asset = {
  id: string
  projectId: string
  prompt: string
  status: 'generated' | 'reused' | 'needs_regen'
  dataUrl: string
  createdAt: number
  // Extended metadata
  sceneNumber?: number
  timeCode?: string
  lyrics?: string
  visualNotes?: string
}

export type StoryboardItem = {
  assetId: string
  durationSec: number
  animate: boolean
  position?: string
}

export type RenderRecord = {
  id: string
  createdAt: number
  status: 'ready' | 'failed'
  costCredits?: number
  snapshotHash?: string
  outputUrl?: string
}

export type Project = {
  id: string
  createdAt: number
  audioPath?: string
  assets: Asset[]
  storyboard: StoryboardItem[]
  renders: RenderRecord[]
}

// Fallback in-memory store for dev/build without Redis
const MEMORY_STORE: Record<string, Project> = {}

async function getRedis() {
  if (!client) return null
  if (!client.isOpen) await client.connect()
  return client
}

export async function createProject(): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    assets: [],
    storyboard: [],
    renders: [],
  }
  await upsertProject(project)
  return project
}

export async function getProject(projectId: string): Promise<Project | null> {
  const redis = await getRedis()
  if (redis) {
    const data = await redis.get(`project:${projectId}`)
    return data ? JSON.parse(data) : null
  }
  return MEMORY_STORE[projectId] || null
}

export async function upsertProject(project: Project): Promise<void> {
  const redis = await getRedis()
  if (redis) {
    // Expire in 7 days (604800 seconds) to manage cost
    await redis.set(`project:${project.id}`, JSON.stringify(project), { EX: 604800 })
  } else {
    MEMORY_STORE[project.id] = project
  }
}

export async function addAssets(projectId: string, assets: Asset[]): Promise<Project> {
  const proj = await getProject(projectId)
  if (!proj) throw new Error('Project not found')
  
  proj.assets.push(...assets)
  
  // default storyboard entries
  assets.forEach((a) => {
    proj.storyboard.push({ assetId: a.id, durationSec: 5, animate: false })
  })
  
  await upsertProject(proj)
  return proj
}
