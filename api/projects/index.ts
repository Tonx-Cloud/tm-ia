import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSession } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { createProject, listProjects, upsertProject } from '../_lib/projectStore.js'
import { withObservability } from '../_lib/observability.js'

// Create a project explicitly (recommended flow):
// 1) POST /api/projects { name }
// 2) POST /api/upload (multipart) with projectId
// 3) subsequent steps reference the same projectId

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method === 'GET') {
    const session = getSession(req)
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

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const session = getSession(req)
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
