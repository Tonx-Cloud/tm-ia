const requiredVars = [
  'OPENAI_API_KEY',
  'GEMINI_API_KEY',
  'JWT_SECRET',
] as const

const jwtVars = ['JWT_SECRET'] as const

const optionalVars = [
  'STORAGE_BUCKET',
  'STORAGE_REGION',
  'STORAGE_ACCESS_KEY',
  'STORAGE_SECRET_KEY',
  'MP_ACCESS_TOKEN',
  'MP_WEBHOOK_SECRET',
  'MERCADOPAGO_PUBLIC_KEY',
  'PUBLIC_BASE_URL',
  'MP_NOTIFICATION_URL',
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
