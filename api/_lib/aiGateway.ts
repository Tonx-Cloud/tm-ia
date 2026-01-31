import { generateText } from 'ai'
import type { ObservabilityContext } from './observability.js'

export type AiUsage = {
  inputTokens?: number
  outputTokens?: number
  totalTokens?: number
}

export async function gatewayGenerateText(params: {
  model: string
  prompt: string
  ctx?: ObservabilityContext
  maxOutputTokens?: number
}) {
  const { model, prompt, ctx, maxOutputTokens } = params

  const startedAt = Date.now()
  const result: any = await generateText({
    model, // using AI Gateway via model string
    prompt,
    maxOutputTokens,
  })

  const usage: AiUsage = {
    inputTokens: (result.usage as any)?.inputTokens,
    outputTokens: (result.usage as any)?.outputTokens,
    totalTokens: (result.usage as any)?.totalTokens,
  }

  ctx?.log?.('info', 'ai.gateway.usage', {
    model,
    ms: Date.now() - startedAt,
    usage,
  })

  return { text: result.text || '', files: (result as any).files || [], usage }
}
