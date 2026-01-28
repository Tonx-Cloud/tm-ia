/**
 * TM-IA Pricing System
 * 
 * Rate: $1.00 USD = 100 credits
 * Markup: 5x for animation, 10x for other actions
 * 
 * @see docs/CREDITS_MODEL.md for full documentation
 */

// =============================================================================
// PRICING CONSTANTS (in credits)
// =============================================================================

export const PRICING = {
  // API-based actions (with API cost)
  TRANSCRIPTION_PER_MINUTE: 3,      // $0.003 API cost * 10x = $0.03 = 3 credits
  ANALYSIS_HOOK: 1,                  // ~$0.001 API cost * 10x = $0.01 = 1 credit
  GENERATE_IMAGE: 30,                // $0.03 API cost * 10x = $0.30 = 30 credits
  REGENERATE_IMAGE: 30,              // Same as generate
  ANIMATE_PER_SECOND: 50,            // $0.10 API cost * 5x = $0.50 = 50 credits

  // Non-API actions (market-based pricing)
  RENDER_PER_MINUTE: 100,            // $1.00 per minute of final video
  EXPORT_4K: 200,                    // $2.00 premium feature
  REMOVE_WATERMARK: 50,              // $0.50 to remove watermark

  // Free actions
  REORDER_STORYBOARD: 0,
  ADJUST_DURATION: 0,
  TOGGLE_ANIMATE: 0,
  REUSE_IMAGE: 0,
  PREVIEW_WATERMARK: 0,
  RE_RENDER_NO_CHANGES: 0,
  UPLOAD_AUDIO: 0,
  EXPORT_HD: 0,                      // 1080p included
} as const

export type PricingAction = keyof typeof PRICING

// =============================================================================
// CREDIT PACKAGES
// =============================================================================

export const CREDIT_PACKAGES = [
  {
    id: 'starter',
    name: 'Starter',
    credits: 500,
    priceUSD: 5.00,
    priceBRL: 25.00,      // Approx. rate
    discount: 0,
    description: 'Testar o sistema',
  },
  {
    id: 'creator',
    name: 'Creator',
    credits: 2000,
    priceUSD: 18.00,
    priceBRL: 90.00,
    discount: 10,
    description: '4-6 videos simples',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 5000,
    priceUSD: 40.00,
    priceBRL: 200.00,
    discount: 20,
    description: 'Producao regular',
  },
  {
    id: 'studio',
    name: 'Studio',
    credits: 15000,
    priceUSD: 100.00,
    priceBRL: 500.00,
    discount: 33,
    description: 'Alto volume',
  },
] as const

export type CreditPackageId = typeof CREDIT_PACKAGES[number]['id']

// =============================================================================
// COST ESTIMATION FUNCTIONS
// =============================================================================

/**
 * Get the credit cost for a single action
 */
export function getActionCost(action: PricingAction, quantity: number = 1): number {
  const unitCost = PRICING[action] ?? 0
  return unitCost * quantity
}

/**
 * Convert credits to USD
 */
export function creditsToUSD(credits: number): number {
  return credits / 100
}

/**
 * Convert USD to credits
 */
export function usdToCredits(usd: number): number {
  return Math.ceil(usd * 100)
}

// =============================================================================
// RENDER COST CALCULATION
// =============================================================================

export interface RenderCostConfig {
  /** Number of new images to generate */
  newImages: number
  /** Duration of animation in seconds (total across all animated scenes) */
  animationSeconds: number
  /** Final video duration in minutes */
  durationMinutes: number
  /** Output quality: 'hd' (1080p) or '4k' */
  quality: 'hd' | '4k'
  /** Include watermark removal */
  removeWatermark: boolean
}

export interface CostBreakdown {
  images: number
  animation: number
  render: number
  export4k: number
  watermark: number
  total: number
}

/**
 * Calculate full cost breakdown for a render job
 */
export function calculateRenderCost(config: RenderCostConfig): CostBreakdown {
  const images = config.newImages * PRICING.GENERATE_IMAGE
  const animation = config.animationSeconds * PRICING.ANIMATE_PER_SECOND
  const render = Math.ceil(config.durationMinutes) * PRICING.RENDER_PER_MINUTE
  const export4k = config.quality === '4k' ? PRICING.EXPORT_4K : 0
  const watermark = config.removeWatermark ? PRICING.REMOVE_WATERMARK : 0

  return {
    images,
    animation,
    render,
    export4k,
    watermark,
    total: images + animation + render + export4k + watermark,
  }
}

// =============================================================================
// TRANSCRIPTION COST
// =============================================================================

/**
 * Calculate transcription cost based on audio duration
 * @param durationSeconds Audio duration in seconds
 */
export function calculateTranscriptionCost(durationSeconds: number): number {
  const minutes = Math.ceil(durationSeconds / 60)
  return minutes * PRICING.TRANSCRIPTION_PER_MINUTE
}

// =============================================================================
// SIMPLE RENDER COST (for existing estimateCost compatibility)
// =============================================================================

export interface SimpleRenderConfig {
  duration: number        // Total video duration in seconds
  quality: string         // 'hd', '1080p', '4K', etc.
  scenesCount: number     // Number of scenes
  hasAnimation?: boolean  // Whether animation is used
  animationSeconds?: number // Total animation seconds
}

/**
 * Simplified cost estimation for backward compatibility
 * Maps to new pricing model
 */
export function estimateRenderCost(config: SimpleRenderConfig): number {
  const durationMinutes = config.duration / 60
  
  // Base render cost
  let cost = Math.ceil(durationMinutes) * PRICING.RENDER_PER_MINUTE
  
  // 4K export premium
  if (config.quality === '4K' || config.quality === '4k') {
    cost += PRICING.EXPORT_4K
  }
  
  // Animation cost
  if (config.hasAnimation && config.animationSeconds) {
    cost += config.animationSeconds * PRICING.ANIMATE_PER_SECOND
  }
  
  return cost
}

// =============================================================================
// PACKAGE LOOKUP
// =============================================================================

export function getPackageById(id: string) {
  return CREDIT_PACKAGES.find(p => p.id === id)
}

export function getPackageByCredits(credits: number) {
  return CREDIT_PACKAGES.find(p => p.credits === credits)
}

// =============================================================================
// COST DISPLAY HELPERS
// =============================================================================

export interface CostDisplayInfo {
  credits: number
  usd: string
  brl: string
}

/**
 * Format cost for display in UI
 */
export function formatCostDisplay(credits: number): CostDisplayInfo {
  const usd = creditsToUSD(credits)
  // Approximate BRL conversion (should use real rate in production)
  const brl = usd * 5
  
  return {
    credits,
    usd: `$${usd.toFixed(2)}`,
    brl: `R$${brl.toFixed(2)}`,
  }
}

/**
 * Check if user has enough credits for an action
 */
export function canAfford(balance: number, cost: number): boolean {
  return balance >= cost
}

/**
 * Get remaining balance after action
 */
export function balanceAfter(balance: number, cost: number): number {
  return Math.max(0, balance - cost)
}
