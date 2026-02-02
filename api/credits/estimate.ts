import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../_lib/auth.js'
import { getBalance } from '../_lib/credits.js'
import { 
  PRICING, 
  getActionCost, 
  calculateRenderCost, 
  calculateTranscriptionCost,
  formatCostDisplay,
  canAfford,
  balanceAfter,
  type RenderCostConfig,
  type CostBreakdown,
} from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'

/**
 * Estimate cost before performing an action
 * 
 * POST /api/credits/estimate
 * 
 * Body options:
 * - { action: 'GENERATE_IMAGE', quantity: 8 }
 * - { action: 'TRANSCRIPTION_PER_MINUTE', audioDurationSeconds: 180 }
 * - { action: 'render', config: RenderCostConfig }
 * 
 * Returns estimated cost, current balance, and whether user can afford it
 */
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const session = await getSessionFromRequest(req)
  if (!session) {
    ctx.log('warn', 'auth.missing')
    return res.status(401).json({ error: 'Auth required', requestId: ctx.requestId })
  }
  ctx.userId = session.userId

  const { 
    action, 
    quantity, 
    audioDurationSeconds,
    renderConfig 
  } = req.body as { 
    action?: string
    quantity?: number
    audioDurationSeconds?: number
    renderConfig?: RenderCostConfig
  }

  if (!action) {
    return res.status(400).json({ 
      error: 'action required',
      availableActions: Object.keys(PRICING),
      requestId: ctx.requestId 
    })
  }

  const balance = await getBalance(session.userId)
  let cost: number
  let breakdown: CostBreakdown | null = null

  // Handle different action types
  if (action === 'render' && renderConfig) {
    // Full render cost calculation
    const result = calculateRenderCost(renderConfig)
    cost = result.total
    breakdown = result
  } else if (action === 'transcription' && audioDurationSeconds) {
    // Transcription cost based on audio duration
    cost = calculateTranscriptionCost(audioDurationSeconds)
  } else if (action in PRICING) {
    // Simple action cost
    cost = getActionCost(action as keyof typeof PRICING, quantity ?? 1)
  } else {
    return res.status(400).json({ 
      error: 'Invalid action',
      availableActions: Object.keys(PRICING),
      requestId: ctx.requestId 
    })
  }

  const canProceed = canAfford(balance, cost)
  const remaining = balanceAfter(balance, cost)
  const display = formatCostDisplay(cost)

  ctx.log('info', 'credits.estimate', { 
    action, 
    cost, 
    balance, 
    canProceed 
  })

  return res.status(200).json({
    action,
    cost,
    breakdown,
    display,
    balance,
    canAfford: canProceed,
    balanceAfter: remaining,
    insufficientBy: canProceed ? 0 : cost - balance,
    requestId: ctx.requestId,
  })
})
