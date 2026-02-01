import type { VercelRequest, VercelResponse } from '@vercel/node'

export default function handler(req: VercelRequest, res: VercelResponse) {
    const baseUrlEnv = process.env.PUBLIC_BASE_URL || '(undefined)'

    // Logic from google.ts
    const baseUrlComputed = (process.env.PUBLIC_BASE_URL ||
        (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : 'https://tm-ia.vercel.app')).trim()

    const redirectUri = `${baseUrlComputed}/api/auth/google/callback`

    const debugInfo = {
        env: {
            NODE_ENV: process.env.NODE_ENV,
            PUBLIC_BASE_URL_RAW: `"${baseUrlEnv}"`, // quoted to see spaces
            PUBLIC_BASE_URL_LENGTH: baseUrlEnv.length,
            GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').substring(0, 15) + '...',
        },
        computed: {
            baseUrl: `"${baseUrlComputed}"`,
            redirectUri: `"${redirectUri}"`, // This MUST match Google Console exactly
            redirectUriLength: redirectUri.length
        },
        message: "Check if 'computed.redirectUri' matches EXACTLY what is in Google Cloud Console."
    }

    res.json(debugInfo)
}
