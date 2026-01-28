export interface PricingPackage {
  id: string
  name: string
  credits: number
  priceUSD: number
  priceBRL: number
  discount: number
  description: string
  pricePerCredit: number
  savingsUSD: number
}

export interface PricingResponse {
  packages: PricingPackage[]
  rate: {
    creditsPerDollar: number
    description: string
  }
}

export interface EstimateResponse {
  action: string
  cost: number
  display: {
    credits: number
    usd: string
    brl: string
  }
  balance: number
  canAfford: boolean
  balanceAfter: number
  insufficientBy: number
  breakdown?: {
    images: number
    animation: number
    render: number
    export4k: number
    watermark: number
    total: number
  }
}

export interface RenderCostConfig {
  newImages: number
  animationSeconds: number
  durationMinutes: number
  quality: 'hd' | '4k'
  removeWatermark: boolean
}

const API = import.meta.env.VITE_API_BASE || ''

export async function fetchPackages(token?: string): Promise<PricingResponse> {
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`

  const res = await fetch(`${API}/api/credits/packages`, { headers })
  if (!res.ok) throw new Error('Failed to fetch packages')
  return res.json()
}

export async function estimateCost(
  token: string,
  params: { 
    action: string
    quantity?: number
    audioDurationSeconds?: number
    renderConfig?: RenderCostConfig
  }
): Promise<EstimateResponse> {
  const res = await fetch(`${API}/api/credits/estimate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify(params)
  })
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to estimate cost')
  }
  
  return res.json()
}
