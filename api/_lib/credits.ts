import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

/**
 * Credit transaction reasons
 * @see docs/CREDITS_MODEL.md for pricing details
 */
export type CreditReason =
  // Earning credits
  | 'initial'              // Initial demo balance
  | 'purchase'             // Credit package purchase
  | 'payment_pix'          // PIX payment (legacy)
  | 'admin_adjust'         // Admin adjustment
  | 'refund'               // Refund
  
  // Spending credits - API actions
  | 'transcription'        // Audio transcription (per minute)
  | 'analysis'             // Text analysis/hook generation
  | 'generate_image'       // Generate new image
  | 'regenerate_image'     // Regenerate existing image
  | 'animate_image'        // Image animation (per second)
  
  // Spending credits - Render actions
  | 'render'               // Final render (per minute)
  | 'render_base'          // Legacy: base render
  | 'pro_render'           // Legacy: pro render
  | 'export_4k'            // 4K export premium
  | 'remove_watermark'     // Watermark removal
  
  // Legacy
  | 'demo_unlock'          // Demo unlock (legacy)

export type CreditEntry = {
  id: string
  userId: string
  type: 'earn' | 'spend'
  amount: number
  reason: CreditReason
  projectId?: string
  renderId?: string
  createdAt: number
}

export type CreditLedger = {
  balance: number
  entries: CreditEntry[]
}

function storePath(userId: string) {
  return path.join(process.env.TMPDIR || process.env.TEMP || '/tmp', `credits_${userId}.json`)
}

function loadLedger(userId: string): CreditLedger {
  const p = storePath(userId)
  try {
    const raw = fs.readFileSync(p, 'utf-8')
    const parsed = JSON.parse(raw) as CreditLedger
    return {
      balance: parsed.balance ?? 0,
      entries: Array.isArray(parsed.entries) ? parsed.entries : [],
    }
  } catch {
    return { balance: 0, entries: [] }
  }
}

function saveLedger(userId: string, ledger: CreditLedger) {
  fs.writeFileSync(storePath(userId), JSON.stringify(ledger, null, 2))
}

export function getBalance(userId: string) {
  return loadLedger(userId).balance
}

export function getLedger(userId: string, limit = 10) {
  const { entries } = loadLedger(userId)
  return entries.slice(-limit).reverse()
}

export function addCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')
  const ledger = loadLedger(userId)
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    userId,
    type: 'earn',
    amount,
    reason,
    projectId: meta?.projectId,
    renderId: meta?.renderId,
    createdAt: Date.now(),
  }
  ledger.balance += amount
  ledger.entries.push(entry)
  saveLedger(userId, ledger)
  return ledger.balance
}

export function spendCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')
  const ledger = loadLedger(userId)
  if (ledger.balance < amount) throw new Error('Insufficient credits')
  const entry: CreditEntry = {
    id: crypto.randomUUID(),
    userId,
    type: 'spend',
    amount: -amount,
    reason,
    projectId: meta?.projectId,
    renderId: meta?.renderId,
    createdAt: Date.now(),
  }
  ledger.balance -= amount
  ledger.entries.push(entry)
  saveLedger(userId, ledger)
  return ledger.balance
}
