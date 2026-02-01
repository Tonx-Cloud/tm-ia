import crypto from 'crypto'
import { prisma } from './prisma.js'

export type CreditReason =
  | 'initial'
  | 'purchase'
  | 'payment_pix'
  | 'admin_adjust'
  | 'refund'
  | 'transcription'
  | 'analysis'
  | 'generate_image'
  | 'regenerate_image'
  | 'animate_image'
  | 'render'
  | 'render_base'
  | 'pro_render'
  | 'export_4k'
  | 'remove_watermark'
  | 'demo_unlock'

export type CreditEntry = {
  id: string
  userId: string
  type: 'earn' | 'spend'
  amount: number
  reason: CreditReason
  projectId?: string
  renderId?: string
  assetId?: string
  createdAt: number
}

async function ensureUser(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId } })
  if (existing) return existing
  // Fallback email placeholder; real email should be upserted by auth endpoints.
  return prisma.user.create({
    data: {
      id: userId,
      email: `user-${userId}@tm.local`,
      credits: 0,
    },
  })
}

export async function getBalance(userId: string): Promise<number> {
  const u = await ensureUser(userId)
  return u.credits
}

export async function getLedger(userId: string, limit = 10): Promise<CreditEntry[]> {
  await ensureUser(userId)
  const rows = await prisma.creditEntry.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    type: (r.type as any) || 'earn',
    amount: r.amount,
    reason: r.reason as any,
    projectId: r.projectId || undefined,
    renderId: r.renderId || undefined,
    assetId: (r as any).assetId || undefined,
    createdAt: r.createdAt.getTime(),
  }))
}

export async function addCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')

  await ensureUser(userId)

  const res = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { increment: amount } },
    })

    await tx.creditEntry.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        type: 'earn',
        amount,
        reason,
        projectId: meta?.projectId,
        renderId: meta?.renderId,
        assetId: meta?.assetId,
      },
    })

    return updated.credits
  })

  return res
}

export async function spendCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')

  await ensureUser(userId)

  const res = await prisma.$transaction(async (tx) => {
    const u = await tx.user.findUnique({ where: { id: userId } })
    if (!u) throw new Error('User not found')

    // Idempotency (best-effort): if we already logged a spend for the same reason+renderId, don't charge twice.
    // This is used mainly for render endpoints where retries/timeouts can happen.
    if (meta?.renderId) {
      const existing = await tx.creditEntry.findFirst({
        where: {
          userId,
          type: 'spend',
          reason,
          renderId: meta.renderId,
        },
        orderBy: { createdAt: 'desc' },
      })
      if (existing) return u.credits
    }

    if (u.credits < amount) throw new Error('Insufficient credits')

    const updated = await tx.user.update({
      where: { id: userId },
      data: { credits: { decrement: amount } },
    })

    await tx.creditEntry.create({
      data: {
        id: crypto.randomUUID(),
        userId,
        type: 'spend',
        amount: -amount,
        reason,
        projectId: meta?.projectId,
        renderId: meta?.renderId,
        assetId: meta?.assetId,
      },
    })

    return updated.credits
  })

  return res
}
