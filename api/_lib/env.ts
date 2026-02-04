const requiredVars = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'JWT_SECRET',
  'DATABASE_URL',
] as const

const jwtVars = ['JWT_SECRET'] as const

const optionalVars = [
  // Legacy (pre-R2)
  'STORAGE_BUCKET',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',

  // Cloudflare R2
  'R2_ACCOUNT_ID',
  'R2_BUCKET',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_PUBLIC_BASE_URL',

  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'MERCADOPAGO_PUBLIC_KEY',
  'PUBLIC_BASE_URL',
  'MP_NOTIFICATION_URL',

  // External ASR (VM) - optional
  'ASR_BASE_URL',
  'ASR_TOKEN',

  // External render worker (VM) - optional
  'RENDER_BASE_URL',
  'RENDER_TOKEN',

  // Google Cloud / Vertex AI (Veo)
  'GCLOUD_PROJECT',
  'GCLOUD_LOCATION', // defaults to us-central1
  'GOOGLE_APPLICATION_CREDENTIALS_JSON',
] as const

type EnvKey = (typeof requiredVars)[number]
type JwtKey = (typeof jwtVars)[number]
type OptKey = (typeof optionalVars)[number]

type Env = Record<EnvKey, string> & Partial<Record<OptKey, string>>

export function loadEnv(): Env {
  const missing: string[] = []
  const values = requiredVars.reduce((acc, key) => {
    const value = process.env[key]
    if (!value) missing.push(key)
    acc[key] = value ?? ''
    return acc
  }, {} as Record<EnvKey, string>)

  optionalVars.forEach((key) => {
    const value = process.env[key]
    if (value) (values as any)[key] = value
  })

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return values
}

export function loadJwtEnv(): Record<JwtKey, string> {
  const missing: string[] = []
  const values = jwtVars.reduce((acc, key) => {
    const value = process.env[key]
    if (!value) missing.push(key)
    acc[key] = value ?? ''
    return acc
  }, {} as Record<JwtKey, string>)

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return values
}
