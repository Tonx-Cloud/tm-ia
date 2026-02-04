import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadEnv, loadJwtEnv } from '../../_lib/env.js'
import { prisma } from '../../_lib/prisma.js'
import { withObservability } from '../../_lib/observability.js'

// Internal endpoint called by the VM worker when it finishes.
// Auth: header `x-internal-render-secret` == JWT_SECRET

export const config = {
  maxDuration: 60,
}

type Body = {
  userId: string
  renderId: string
  status: 'complete' | 'failed'
  outputUrl?: string
  error?: string
  logTail?: string
  progress?: number
}

const LOG_TAIL_MAX_CHARS = 12_000

function append(prev: string, chunk: string): string {
  const next = (prev ? prev + '\n' : '') + chunk
  return next.length > LOG_TAIL_MAX_CHARS ? next.slice(-LOG_TAIL_MAX_CHARS) : next
}

export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })

  try {
    loadEnv()
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message, requestId: ctx.requestId })
  }

  const secret = (req.headers['x-internal-render-secret'] as string) || ''
  const jwtEnv = loadJwtEnv()
  if (!secret || secret !== jwtEnv.JWT_SECRET) {
    return res.status(401).json({ error: 'Unauthorized', requestId: ctx.requestId })
  }

  const body = (req.body ?? {}) as Body
  if (!body.userId || !body.renderId || !body.status) {
    return res.status(400).json({ error: 'userId, renderId, status required', requestId: ctx.requestId })
  }

  ctx.userId = body.userId

  const r = await prisma.render.findFirst({ where: { id: body.renderId, userId: body.userId } })
  if (!r) return res.status(404).json({ error: 'Render not found', requestId: ctx.requestId })

  const logTail = body.logTail ? append(r.logTail || '', body.logTail) : r.logTail

  await prisma.render.updateMany({
    where: { id: body.renderId, userId: body.userId },
    data: {
      status: body.status,
      progress: body.status === 'complete' ? 100 : Math.min(99, Math.max(5, body.progress ?? r.progress ?? 5)),
      outputUrl: body.outputUrl ?? r.outputUrl ?? undefined,
      error: body.error ?? undefined,
      logTail: logTail ?? undefined,
    },
  })

  return res.status(200).json({ ok: true, requestId: ctx.requestId })
})
