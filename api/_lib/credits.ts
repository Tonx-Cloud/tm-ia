import { createClient } from 'redis'
import crypto from 'crypto'

// Reuse Redis client from projectStore logic or create new
const redisUrl = process.env.REDIS_URL
const client = redisUrl ? createClient({ url: redisUrl }) : null

if (client) {
  client.on('error', (err) => console.error('Redis Client Error', err))
  if (!client.isOpen) client.connect().catch(console.error)
}

/**
 * Credit transaction reasons
 * @see docs/CREDITS_MODEL.md for pricing details
 */
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
  createdAt: number
}

export type CreditLedger = {
  balance: number
  entries: CreditEntry[]
}

const MEMORY_LEDGERS: Record<string, CreditLedger> = {}

async function getRedis() {
  if (!client) return null
  if (!client.isOpen) await client.connect()
  return client
}

async function loadLedger(userId: string): Promise<CreditLedger> {
  const redis = await getRedis()
  if (redis) {
    const data = await redis.get(`credits:${userId}`)
    if (data) return JSON.parse(data)
  }
  return MEMORY_LEDGERS[userId] || { balance: 0, entries: [] }
}

async function saveLedger(userId: string, ledger: CreditLedger) {
  const redis = await getRedis()
  if (redis) {
    await redis.set(`credits:${userId}`, JSON.stringify(ledger))
  } else {
    MEMORY_LEDGERS[userId] = ledger
  }
}

// NOTE: Changed to async!
export async function getBalance(userId: string): Promise<number> {
  const ledger = await loadLedger(userId)
  return ledger.balance
}

// NOTE: Changed to async!
export async function getLedger(userId: string, limit = 10): Promise<CreditEntry[]> {
  const { entries } = await loadLedger(userId)
  return entries.slice(-limit).reverse()
}

export async function addCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')
  const ledger = await loadLedger(userId)
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
  await saveLedger(userId, ledger)
  return ledger.balance
}

export async function spendCredits(userId: string, amount: number, reason: CreditReason, meta?: Partial<CreditEntry>) {
  if (amount <= 0) throw new Error('amount must be positive')
  const ledger = await loadLedger(userId)
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
  await saveLedger(userId, ledger)
  return ledger.balance
}
