import OpenAI from 'openai'
import { loadEnv } from './env.js'

let client: OpenAI | null = null

export function getOpenAI() {
  if (client) return client
  const env = loadEnv()
  client = new OpenAI({ apiKey: env.OPENAI_API_KEY })
  return client
}
