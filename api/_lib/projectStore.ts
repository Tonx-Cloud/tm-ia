import { prisma } from './prisma.js'
import crypto from 'crypto'

export type Asset = {
  id: string
  projectId: string
  prompt: string
  status: string
  dataUrl: string
  fileKey?: string

  animation?: {
    status: 'pending' | 'completed' | 'failed'
    videoUrl?: string
    jobId?: string
    provider?: string
  }

  createdAt: number
  sceneNumber?: number
  timeCode?: string
  lyrics?: string
  visualNotes?: string
  durationSec?: number
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
  status: string
  progress?: number
  costCredits?: number
  snapshotHash?: string
  outputUrl?: string
  error?: string
  logTail?: string
}

export type Project = {
  id: string
  createdAt: number
  userId?: string
  name?: string
  audioPath?: string
  audioUrl?: string
  audioFilename?: string
  audioMime?: string
  audioData?: string
  mood?: string
  style?: string
  aspectRatio?: string
  assets: Asset[]
  storyboard: StoryboardItem[]
  renders: RenderRecord[]
}

function mapProject(p: any): Project {
  let storyboard: StoryboardItem[] = []
  try {
    storyboard = JSON.parse(p.storyboard || '[]')
  } catch (e) {
    storyboard = []
  }

  return {
    id: p.id,
    createdAt: p.createdAt.getTime(),
    userId: p.userId || undefined,
    name: p.name || undefined,
    audioPath: p.audioPath || undefined,
    audioUrl: p.audioUrl || undefined,
    audioFilename: p.audioFilename || undefined,
    audioMime: p.audioMime || undefined,
    audioData: p.audioData || undefined,
    mood: p.mood || undefined,
    style: p.style || undefined,
    aspectRatio: p.aspectRatio || undefined,
    assets: p.assets.map((a: any) => ({
      id: a.id,
      projectId: a.projectId,
      prompt: a.prompt,
      status: a.status,
      dataUrl: a.dataUrl,
      fileKey: a.fileKey || undefined,
      animation: a.animationStatus
        ? {
            status: a.animationStatus,
            videoUrl: a.animationVideoUrl || undefined,
            jobId: a.animationJobId || undefined,
            provider: a.animationProvider || undefined,
          }
        : undefined,
      createdAt: a.createdAt.getTime(),
      sceneNumber: a.sceneNumber || undefined,
      timeCode: a.timeCode || undefined,
      lyrics: a.lyrics || undefined,
      visualNotes: a.visualNotes || undefined,
    })),
    storyboard,
    renders: p.renders.map((r: any) => ({
      id: r.id,
      createdAt: r.createdAt.getTime(),
      status: r.status,
      progress: r.progress,
      outputUrl: r.outputUrl || undefined,
      error: r.error || undefined,
      logTail: r.logTail || undefined,
      costCredits: r.costCredits || undefined,
    })),
  }
}

export async function createProject(userId?: string): Promise<Project> {
  const data: any = {
    storyboard: '[]',
  }
  if (userId) data.userId = userId

  const p = await prisma.project.create({
    data,
    include: { assets: true, renders: true }
  })
  return mapProject(p)
}

export async function getProject(projectId: string): Promise<Project | null> {
  const p = await prisma.project.findUnique({
    where: { id: projectId },
    include: { assets: true, renders: true }
  })
  if (!p) return null
  return mapProject(p)
}

export async function upsertProject(project: Project): Promise<void> {
  // Update main fields
  await prisma.project.update({
    where: { id: project.id },
    data: {
      name: project.name,
      userId: project.userId,
      audioUrl: project.audioUrl,
      audioPath: project.audioPath,
      audioFilename: project.audioFilename,
      audioMime: project.audioMime,
      audioData: project.audioData,
      storyboard: JSON.stringify(project.storyboard),
      mood: project.mood,
      style: project.style,
      aspectRatio: project.aspectRatio,
    }
  })
}

export async function listProjects(userId: string, limit = 50): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { assets: true, renders: true }
  })
  return projects.map(mapProject)
}

export async function addAssets(projectId: string, assets: Asset[]): Promise<Project> {
  // 1. Create assets in DB
  await prisma.$transaction(
    assets.map(a => prisma.asset.create({
      data: {
        id: a.id,
        projectId,
        prompt: a.prompt,
        status: a.status,
        dataUrl: a.dataUrl,
        fileKey: (a as any).fileKey,
        sceneNumber: a.sceneNumber,
        timeCode: a.timeCode,
        lyrics: a.lyrics,
        visualNotes: a.visualNotes,
        createdAt: new Date(a.createdAt),
      }
    }))
  )

  // 2. Append to storyboard
  const proj = await getProject(projectId)
  if (!proj) throw new Error('Project not found')

  const newItems = assets.map(a => ({ assetId: a.id, durationSec: a.durationSec || 5, animate: false }))
  const updatedStoryboard = [...proj.storyboard, ...newItems]

  await prisma.project.update({
    where: { id: projectId },
    data: { storyboard: JSON.stringify(updatedStoryboard) }
  })

  return (await getProject(projectId))!
}

export async function updateAsset(projectId: string, assetId: string, patch: Partial<Asset>): Promise<void> {
  // Only allow updates inside the same project
  await prisma.asset.updateMany({
    where: { id: assetId, projectId },
    data: {
      prompt: patch.prompt,
      status: patch.status,
      dataUrl: patch.dataUrl,
      animationStatus: patch.animation?.status,
      animationVideoUrl: patch.animation?.videoUrl,
      animationJobId: patch.animation?.jobId,
      animationProvider: patch.animation?.provider,
      fileKey: (patch as any).fileKey,
      sceneNumber: (patch as any).sceneNumber,
      timeCode: (patch as any).timeCode,
      lyrics: (patch as any).lyrics,
      visualNotes: (patch as any).visualNotes,
      createdAt: patch.createdAt ? new Date(patch.createdAt) : undefined,
    },
  })
}

export async function getAsset(projectId: string, assetId: string): Promise<Asset | null> {
  const a = await prisma.asset.findFirst({
    where: { id: assetId, projectId }
  })
  if (!a) return null
  return {
    id: a.id,
    projectId: a.projectId,
    prompt: a.prompt,
    status: a.status,
    dataUrl: a.dataUrl,
    fileKey: a.fileKey || undefined,
    animation: a.animationStatus
      ? {
          status: a.animationStatus as any,
          videoUrl: (a as any).animationVideoUrl || undefined,
          jobId: (a as any).animationJobId || undefined,
          provider: (a as any).animationProvider || undefined,
        }
      : undefined,
    createdAt: a.createdAt.getTime(),
    sceneNumber: a.sceneNumber || undefined,
    timeCode: a.timeCode || undefined,
    lyrics: a.lyrics || undefined,
    visualNotes: a.visualNotes || undefined,
    durationSec: undefined // Filled by storyboard usually, but asset doesn't track it directly
  }
}
