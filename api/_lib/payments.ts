import fs from 'fs'
import path from 'path'

export type PaymentProvider = 'mock' | 'mp'
export type PaymentStatus = 'pending' | 'confirmed' | 'expired'

export type PaymentRecord = {
  paymentId: string
  provider: PaymentProvider
  status: PaymentStatus
  amount: number
  userId: string
  createdAt: number
  email?: string
  description?: string
  externalRef?: string
  qrBase64?: string
  copyCode?: string
  expiresAt?: number
  confirmedAt?: number
  credited?: boolean
  creditedAt?: number
}

const tmpDir = process.env.TMPDIR || process.env.TEMP || '/tmp'

function storePath(paymentId: string) {
  return path.join(tmpDir, `payment_${paymentId}.json`)
}

export function loadPayment(paymentId: string): PaymentRecord | null {
  try {
    const raw = fs.readFileSync(storePath(paymentId), 'utf-8')
    return JSON.parse(raw) as PaymentRecord
  } catch {
    return null
  }
}

export function savePayment(rec: PaymentRecord) {
  fs.writeFileSync(storePath(rec.paymentId), JSON.stringify(rec, null, 2))
}

export function markConfirmed(rec: PaymentRecord) {
  rec.status = 'confirmed'
  if (!rec.confirmedAt) rec.confirmedAt = Date.now()
  savePayment(rec)
  return rec
}

export function markExpired(rec: PaymentRecord) {
  rec.status = 'expired'
  savePayment(rec)
  return rec
}
