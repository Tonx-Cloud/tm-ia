import type { VercelRequest, VercelResponse } from '@vercel/node'
import { loadJwtEnv } from '../../_lib/env.js'

/**
 * GET /api/auth/test-config
 * Diagnostic endpoint to verify all OAuth configuration is correct
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
    const diagnostics: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        checks: {},
        errors: [],
        summary: ''
    }

    const checks = diagnostics.checks as Record<string, unknown>
    const errors = diagnostics.errors as string[]

    // Check 1: JWT_SECRET
    try {
        loadJwtEnv()
        checks['JWT_SECRET'] = '✅ Configured'
    } catch (err) {
        checks['JWT_SECRET'] = '❌ Missing'
        errors.push(`JWT_SECRET: ${(err as Error).message}`)
    }

    // Check 2: GOOGLE_CLIENT_ID
    const clientId = (process.env.GOOGLE_CLIENT_ID || '').trim()
    if (clientId) {
        checks['GOOGLE_CLIENT_ID'] = `✅ Configured (${clientId.substring(0, 15)}...)`
    } else {
        checks['GOOGLE_CLIENT_ID'] = '❌ Missing'
        errors.push('GOOGLE_CLIENT_ID is not set')
    }

    // Check 3: GOOGLE_CLIENT_SECRET
    const clientSecret = (process.env.GOOGLE_CLIENT_SECRET || '').trim()
    if (clientSecret) {
        checks['GOOGLE_CLIENT_SECRET'] = `✅ Configured (length: ${clientSecret.length})`
    } else {
        checks['GOOGLE_CLIENT_SECRET'] = '❌ Missing'
        errors.push('GOOGLE_CLIENT_SECRET is not set')
    }

    // Check 4: NODE_ENV
    checks['NODE_ENV'] = process.env.NODE_ENV || 'undefined'
    checks['VERCEL_ENV'] = process.env.VERCEL_ENV || 'undefined'

    // Check 5: Computed redirect URI
    const baseUrl = process.env.NODE_ENV === 'development'
        ? 'http://localhost:5173'
        : 'https://tm-ia.vercel.app'
    const redirectUri = `${baseUrl}/api/auth/google/callback`
    checks['REDIRECT_URI'] = redirectUri
    checks['REDIRECT_URI_LENGTH'] = redirectUri.length

    // Summary
    if (errors.length === 0) {
        diagnostics.summary = '✅ All OAuth configuration is correct!'
    } else {
        diagnostics.summary = `❌ ${errors.length} configuration issue(s) found`
    }

    res.json(diagnostics)
}
