import type { VercelRequest } from '@vercel/node'
import type { ObservabilityContext } from './observability.js'
import { prisma } from './prisma.js'

export type RateLimitResult = { allowed: true; remaining: number; resetAt: number } | { allowed: false; retryAfterSeconds: number }

export async function checkRateLimit(
  req: VercelRequest,
  opts: { limit: number; windowMs: number; key?: string; scope?: string; ctx?: ObservabilityContext },
): Promise<RateLimitResult> {
  const key = opts.key || getKey(req)
  const scope = opts.scope || getScope(req)
  const now = new Date()
  const resetAt = new Date(now.getTime() + opts.windowMs)

  try {
    const existing = await prisma.rateLimit.findUnique({
      where: { key_scope: { key, scope } },
    })

    if (!existing || existing.resetAt.getTime() <= now.getTime()) {
      await prisma.rateLimit.upsert({
        where: { key_scope: { key, scope } },
        update: { count: 1, resetAt },
        create: { key, scope, count: 1, resetAt },
      })
      return { allowed: true, remaining: opts.limit - 1, resetAt: resetAt.getTime() }
    }

    const updated = await prisma.rateLimit.update({
      where: { key_scope: { key, scope } },
      data: { count: { increment: 1 } },
    })

    if (updated.count > opts.limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt.getTime() - now.getTime()) / 1000))
      opts.ctx?.log?.('warn', 'rate.limit.exceeded', { key, scope, retryAfterSeconds })
      return { allowed: false, retryAfterSeconds }
    }

    return {
      allowed: true,
      remaining: Math.max(0, opts.limit - updated.count),
      resetAt: existing.resetAt.getTime(),
    }
  } catch (err) {
    opts.ctx?.log?.('warn', 'rate.limit.error', { message: (err as Error).message, key, scope })
    return { allowed: true, remaining: Math.max(0, opts.limit - 1), resetAt: resetAt.getTime() }
  }
}

function getKey(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']?.toString().split(',')[0]?.trim()
  return forwarded || req.socket.remoteAddress || 'anon'
}

function getScope(req: VercelRequest) {
  const url = (req.url || '').split('?')[0]
  return url || 'default'
}
