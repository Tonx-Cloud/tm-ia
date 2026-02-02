import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { createProject, listProjects, upsertProject, getProject } from '../_lib/projectStore.js'
import { withObservability } from '../_lib/observability.js'

// Create a project explicitly (recommended flow):
// 1) POST /api/projects { name }
// 2) POST /api/upload (multipart) with projectId
// 3) subsequent steps reference the same projectId

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method === 'GET') {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
    }
    ctx.userId = session.userId

    try {
      loadEnv()
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
    }

    const projects = await listProjects(session.userId, 50)
    return res.status(200).json({
      ok: true,
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name || '(Sem nome)',
        createdAt: p.createdAt,
        assetsCount: p.assets?.length || 0,
      })),
      requestId: ctx.requestId,
    })
  }

  if (req.method === 'PATCH') {
    const session = await getSessionFromRequest(req)
    if (!session) {
      return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
    }
    ctx.userId = session.userId

    try {
      loadEnv()
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
    }

    const { projectId, aspectRatio, style, mood } = (req.body ?? {}) as {
      projectId?: string
      aspectRatio?: string
      style?: string
      mood?: string
    }

    if (!projectId) return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })

    const project = await getProject(projectId)
    if (!project) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })

    // Only allow updating own project
    if (project.userId && project.userId !== session.userId) {
      return res.status(403).json({ error: 'Forbidden', requestId: ctx.requestId })
    }

    project.aspectRatio = aspectRatio || project.aspectRatio
    project.style = style || project.style
    project.mood = mood || project.mood

    await upsertProject(project)

    ctx.log('info', 'projects.patch.updated', {
      projectId,
      aspectRatio: project.aspectRatio,
      style: project.style,
      mood: project.mood,
    })

    return res.status(200).json({ ok: true, projectId, project, requestId: ctx.requestId })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = await getSessionFromRequest(req)
  if (!session) {
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const { name } = (req.body ?? {}) as { name?: string }
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name required', requestId: ctx.requestId })
  }

  const project = await createProject(session.userId)
  project.name = name.trim()
  await upsertProject(project)

  return res.status(200).json({ ok: true, projectId: project.id, project, requestId: ctx.requestId })
})
