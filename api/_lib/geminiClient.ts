import { GoogleGenerativeAI } from '@google/generative-ai'
import { loadEnv } from './env.js'

let genAI: GoogleGenerativeAI | null = null

export function getGemini() {
  if (genAI) return genAI
  const env = loadEnv()
  genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY)
  return genAI
}
