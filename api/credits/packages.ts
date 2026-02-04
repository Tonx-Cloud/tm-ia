import type { VercelRequest, VercelResponse } from '@vercel/node'
import { CREDIT_PACKAGES } from '../_lib/pricing.js'
import { withObservability } from '../_lib/observability.js'

/**
 * List available credit packages
 * 
 * GET /api/credits/packages
 * 
 * Returns all credit packages with pricing information
 */
export default withObservability(function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const packages = CREDIT_PACKAGES.map(pkg => ({
    ...pkg,
    // Add calculated fields
    pricePerCredit: pkg.priceUSD / pkg.credits,
    savingsUSD: pkg.discount > 0 
      ? (pkg.credits * 0.01) - pkg.priceUSD  // Full price - actual price
      : 0,
  }))

  ctx.log('info', 'credits.packages.list')
  return res.status(200).json({
    packages,
    rate: {
      creditsPerDollar: 100,
      description: '$1.00 USD = 100 credits',
    },
    requestId: ctx.requestId,
  })
})
