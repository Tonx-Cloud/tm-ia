import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

const STORE_PATH = path.join(os.tmpdir(), 'tm-ia_projects.json')

export type Asset = {
  id: string
  projectId: string
  prompt: string
  status: 'generated' | 'reused' | 'needs_regen'
  dataUrl: string
  createdAt: number
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

function ensureStore(): Project[] {
  try {
    const raw = fs.readFileSync(STORE_PATH, 'utf-8')
    return JSON.parse(raw) as Project[]
  } catch {
    return []
  }
}

function saveStore(projects: Project[]) {
  fs.writeFileSync(STORE_PATH, JSON.stringify(projects, null, 2))
}

export function createProject(): Project {
  const projects = ensureStore()
  const project: Project = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    assets: [],
    storyboard: [],
    renders: [],
  }
  projects.push(project)
  saveStore(projects)
  return project
}

export function getProject(projectId: string): Project | null {
  const projects = ensureStore()
  return projects.find((p) => p.id === projectId) ?? null
}

export function upsertProject(project: Project) {
  const projects = ensureStore()
  const idx = projects.findIndex((p) => p.id === project.id)
  if (idx >= 0) projects[idx] = project
  else projects.push(project)
  saveStore(projects)
}

export function addAssets(projectId: string, assets: Asset[]) {
  const proj = getProject(projectId)
  if (!proj) throw new Error('Project not found')
  proj.assets.push(...assets)
  // default storyboard entries
  assets.forEach((a) => {
    proj.storyboard.push({ assetId: a.id, durationSec: 5, animate: false })
  })
  upsertProject(proj)
  return proj
}
