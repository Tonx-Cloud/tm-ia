export type ID = string

export type Timestamped = {
  createdAt: string
  updatedAt: string
}

export type User = Timestamped & {
  id: ID
  email: string
  displayName?: string
  locale?: 'en' | 'pt' | 'es'
  credits: number
}

export type Project = Timestamped & {
  id: ID
  userId: ID
  title?: string
  audioUrl?: string
  durationSec?: number
  status: 'demo_pending' | 'demo_ready' | 'pro_pending' | 'pro_ready' | 'failed'
}

export type Render = Timestamped & {
  id: ID
  projectId: ID
  userId: ID
  kind: 'demo' | 'pro'
  format: 'vertical' | 'horizontal' | 'square'
  durationSec?: number
  previewUrl?: string
  finalUrl?: string
  status: 'queued' | 'processing' | 'ready' | 'failed'
  watermark: boolean
}

export type CreditLedgerEntry = Timestamped & {
  id: ID
  userId: ID
  amount: number
  type: 'earn' | 'spend'
  reason:
    | 'demo_log'
    | 'pro_render'
    | 'purchase'
    | 'subscription'
    | 'admin_adjust'
  projectId?: ID
  renderId?: ID
  paymentId?: ID
  subscriptionId?: ID
  balanceAfter?: number
}

export type Subscription = Timestamped & {
  id: ID
  userId: ID
  planId: string
  status: 'active' | 'past_due' | 'canceled'
  renewsAt?: string
  creditsMonthly?: number
}

export type Payment = Timestamped & {
  id: ID
  userId: ID
  externalId?: string
  method: 'pix'
  status: 'pending' | 'paid' | 'failed' | 'refunded'
  amountCents: number
  currency: string
}

export type DemoUsageLog = Timestamped & {
  id: ID
  userId: ID
  date: string
  projectId: ID
  status: 'used' | 'blocked'
  reason?: string
}
