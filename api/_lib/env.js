const requiredVars = ['OPENAI_API_KEY', 'GEMINI_API_KEY', 'JWT_SECRET']
const jwtVars = ['JWT_SECRET']
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
]

export function loadEnv() {
  const missing = []
  const values = {}

  for (const key of requiredVars) {
    const value = process.env[key]
    if (!value) missing.push(key)
    values[key] = value ?? ''
  }

  for (const key of optionalVars) {
    const value = process.env[key]
    if (value) values[key] = value
  }

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return values
}

export function loadJwtEnv() {
  const missing = []
  const values = {}

  for (const key of jwtVars) {
    const value = process.env[key]
    if (!value) missing.push(key)
    values[key] = value ?? ''
  }

  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`)
  }

  return values
}
