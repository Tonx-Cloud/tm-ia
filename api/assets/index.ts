import type { VercelRequest, VercelResponse } from '@vercel/node'
import crypto from 'crypto'
import { getSessionFromRequest } from '../_lib/auth.js'
import { loadEnv } from '../_lib/env.js'
import { addAssets, createProject, getProject, upsertProject, type Asset } from '../_lib/projectStore.js'
import { withObservability } from '../_lib/observability.js'
import { checkRateLimit } from '../_lib/rateLimit.js'
import { spendCredits, getBalance, addCredits } from '../_lib/credits.js'

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', code: 'UNAUTH', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const rate = checkRateLimit(req, { limit: 12, windowMs: 60_000, ctx })
  if (!rate.allowed) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: rate.retryAfterSeconds, requestId: ctx.requestId })
  }

  try {
    loadEnv()
  } catch (err) {
    ctx.log('error', 'env.missing', { message: (err as Error).message })
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  if (req.method === 'POST') {
    const { projectId, prompts, base64Images, audioPath } = req.body as {
      projectId?: string
      prompts?: string[]
      base64Images?: string[]
      audioPath?: string
    }

    if (!prompts || prompts.length === 0) {
      ctx.log('warn', 'assets.post.invalid_body')
      return res.status(400).json({ error: 'prompts required', requestId: ctx.requestId })
    }
    let projId = projectId
    if (!projId) {
      const proj = await createProject()
      projId = proj.id
      if (audioPath) {
        proj.audioPath = audioPath
        await upsertProject(proj)
      }
    } else if (audioPath) {
      const proj = await getProject(projId)
      if (proj) {
        proj.audioPath = audioPath
        await upsertProject(proj)
      }
    }

    // seed demo credits if empty (dev)
    if ((await getBalance(session.userId)) === 0) {
      await addCredits(session.userId, 50, 'initial')
    }

    const assets: Asset[] = prompts.map((prompt, idx) => {
      const dataUrl = base64Images && base64Images[idx] ? base64Images[idx] : ''
      return {
        id: crypto.randomUUID(),
        projectId: projId!,
        prompt,
        status: dataUrl ? 'generated' : 'needs_regen',
        dataUrl,
        createdAt: Date.now(),
      }
    })

    // cobra apenas se tiver base64Images? No MVP, sem custo ao criar stub
    const cost = 0
    if (cost > 0) {
      try {
        spendCredits(session.userId, cost, 'generate_image', { projectId: projId })
      } catch (err) {
        ctx.log('warn', 'assets.post.insufficient_credits', { balance: getBalance(session.userId) })
        return res.status(402).json({ error: 'Insufficient credits', requestId: ctx.requestId })
      }
    }

    const proj = await addAssets(projId!, assets)
    ctx.log('info', 'assets.add', { projectId: projId, count: assets.length })
    return res.status(200).json({ project: proj, cost, requestId: ctx.requestId })
  }

  if (req.method === 'GET') {
    const { projectId } = req.query as { projectId?: string }
    if (!projectId) return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })
    const proj = await getProject(projectId)
    if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
    ctx.log('info', 'assets.get', { projectId })
    return res.status(200).json({ project: proj, requestId: ctx.requestId })
  }

  if (req.method === 'PATCH') {
    const { projectId, storyboard, audioPath, assetOrder, deletedAssetIds, assets: assetsPatch } = req.body as { 
      projectId?: string
      storyboard?: any[]
      audioPath?: string
      assetOrder?: string[]
      deletedAssetIds?: string[]
      assets?: Array<{ id: string; prompt?: string }>
    }

    if (!projectId) return res.status(400).json({ error: 'projectId required', requestId: ctx.requestId })
    
    const proj = await getProject(projectId)
    if (!proj) return res.status(404).json({ error: 'Project not found', requestId: ctx.requestId })
    
    let updated = false

    // Update storyboard directly
    if (storyboard) {
      proj.storyboard = storyboard
      updated = true
    }

    // Update audio
    if (audioPath) {
      proj.audioPath = audioPath
      updated = true
    }

    // Patch asset prompts
    if (assetsPatch && assetsPatch.length > 0) {
      for (const upd of assetsPatch) {
        const a = proj.assets.find((x) => x.id === upd.id)
        if (a && typeof upd.prompt === 'string') a.prompt = upd.prompt
      }
      updated = true
    }

    // Delete assets
    if (deletedAssetIds && deletedAssetIds.length > 0) {
      proj.assets = proj.assets.filter((a) => !deletedAssetIds.includes(a.id))
      proj.storyboard = proj.storyboard.filter((s) => !deletedAssetIds.includes((s as any).assetId))
      updated = true
    }

    // Reorder assets + storyboard to match assetOrder
    if (assetOrder && assetOrder.length > 0) {
      const byId = new Map(proj.assets.map((a) => [a.id, a] as const))
      const sbByAsset = new Map((proj.storyboard as any[]).map((s) => [s.assetId, s] as const))

      const newAssets = assetOrder.map((id) => byId.get(id)).filter(Boolean) as any[]
      // append any missing (safety)
      for (const a of proj.assets) {
        if (!assetOrder.includes(a.id)) newAssets.push(a)
      }
      proj.assets = newAssets

      const newStoryboard = assetOrder.map((id) => sbByAsset.get(id)).filter(Boolean)
      for (const s of proj.storyboard as any[]) {
        if (!assetOrder.includes(s.assetId)) newStoryboard.push(s)
      }
      proj.storyboard = newStoryboard as any
      updated = true
    }

    if (!updated) {
       return res.status(400).json({ error: 'Nothing to update', requestId: ctx.requestId })
    }

    await upsertProject(proj)
    ctx.log('info', 'assets.update', { projectId, updatedFields: { storyboard: !!storyboard, audioPath: !!audioPath, assets: !!assetsPatch?.length, deletedAssetIds: !!deletedAssetIds?.length, assetOrder: !!assetOrder?.length } })
    return res.status(200).json({ project: proj, requestId: ctx.requestId })
  }

  return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })
})
