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
  userId?: string
  name?: string
  // Audio can be stored as a temporary file path (dev), a URL (prod), or inline base64 (fallback)
  audioPath?: string
  audioDataBase64?: string
  audioFilename?: string
  audioMime?: string
  assets: Asset[]
  storyboard: StoryboardItem[]
  renders: RenderRecord[]
}

// Fallback in-memory store for dev/build without Redis
const MEMORY_STORE: Record<string, Project> = {}
const MEMORY_USER_INDEX: Record<string, string[]> = {}

async function getRedis() {
  if (!client) return null
  if (!client.isOpen) await client.connect()
  return client
}

export async function createProject(userId?: string): Promise<Project> {
  const project: Project = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    userId,
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

    // Maintain per-user index for listing projects
    if (project.userId) {
      const indexKey = `userProjects:${project.userId}`
      await redis.zAdd(indexKey, [{ score: project.createdAt, value: project.id }])
      await redis.expire(indexKey, 604800)
    }
  } else {
    MEMORY_STORE[project.id] = project
    if (project.userId) {
      const list = MEMORY_USER_INDEX[project.userId] || []
      if (!list.includes(project.id)) list.unshift(project.id)
      MEMORY_USER_INDEX[project.userId] = list
    }
  }
}

export async function listProjects(userId: string, limit = 50): Promise<Project[]> {
  const redis = await getRedis()
  if (redis) {
    const ids = await redis.zRange(`userProjects:${userId}`, 0, limit - 1, { REV: true })
    const projects: Project[] = []
    for (const id of ids) {
      const p = await getProject(id)
      if (p) projects.push(p)
    }
    return projects
  }

  const ids = (MEMORY_USER_INDEX[userId] || []).slice(0, limit)
  return ids.map((id) => MEMORY_STORE[id]).filter(Boolean)
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
