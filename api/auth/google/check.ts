import type { VercelRequest, VercelResponse } from '@vercel/node'
import { withObservability } from '../../_lib/observability.js'

// ============================================================================
// GOOGLE OAUTH CHECK ENDPOINT
// ============================================================================
// IMPORTANT: This endpoint MUST:
// 1. Use withObservability wrapper (required by dev-server)
// 2. NOT call loadEnv() - it only needs process.env
// 3. Return 200 with configured:false when OAuth is not set up (NOT 503)
//    This allows the frontend to gracefully handle missing OAuth config
//
// DO NOT MODIFY without understanding the auth flow!
// ============================================================================

/**
 * GET /api/auth/google/check
 * Check if Google OAuth is configured (without redirecting)
 * Returns 200 always - check 'configured' field for availability
 */
export default withObservability(async function handler(req: VercelRequest, res: VercelResponse, ctx) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed', requestId: ctx.requestId })
  }

  const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
  const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()

  // Always return 200 - let frontend check 'configured' field
  // This prevents 500 errors when OAuth is simply not configured
  if (!clientId || !clientSecret) {
    ctx.log('info', 'oauth.google.not_configured')
    return res.status(200).json({ 
      configured: false,
      message: 'Google OAuth não configurado. Use email e senha.',
      requestId: ctx.requestId
    })
  }

  ctx.log('info', 'oauth.google.available')
  return res.status(200).json({ 
    configured: true,
    message: 'Google OAuth is available',
    requestId: ctx.requestId
  })
})
