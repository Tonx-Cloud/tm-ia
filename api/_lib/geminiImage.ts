import type { ObservabilityContext } from './observability.js'

// Minimal Gemini Image generation via REST to avoid SDK gaps.
// Uses Google AI Studio / Gemini API key (GEMINI_API_KEY).
// Returns a dataUrl (data:image/png;base64,...) for storage.

export async function generateImageDataUrl(params: {
  apiKey: string
  model: string
  prompt: string
  ctx?: ObservabilityContext
}): Promise<string> {
  const { apiKey, model, prompt, ctx } = params

  // Prefer Vercel AI Gateway when running on Vercel (auto-auth) or when an explicit API key is set.
  // Falls back to direct Gemini REST if gateway fails.
  const canUseGateway = !!process.env.VERCEL || !!process.env.AI_GATEWAY_API_KEY

  if (canUseGateway) {
    try {
      const { gatewayGenerateText } = await import('./aiGateway.js')
      const r = await gatewayGenerateText({
        model: 'google/gemini-3-pro-image',
        prompt,
        ctx,
      })

      const files = r.files || []
      const img = files.find((f: any) => String(f.mediaType || '').startsWith('image/'))
      if (img?.data) {
        const mime = img.mediaType || 'image/png'
        const b64 = Buffer.from(img.data).toString('base64')
        return `data:${mime};base64,${b64}`
      }

      // Some responses may return no files; treat as failure.
      throw new Error('AI Gateway image model returned no image file')
    } catch (err) {
      ctx?.log?.('warn', 'ai.gateway.image_fallback', { message: (err as Error).message })
    }
  }

  // Fallback: direct Gemini REST (Google AI Studio API key)
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseModalities: ['IMAGE'],
    },
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  if (!resp.ok) {
    const text = await resp.text().catch(() => '')
    ctx?.log?.('warn', 'gemini.image_generate_failed', { status: resp.status, text: text.slice(0, 500) })
    throw new Error(`Gemini image generation failed (${resp.status})`)
  }

  const json: any = await resp.json()
  const inline = json?.candidates?.[0]?.content?.parts?.find((p: any) => p.inlineData)?.inlineData

  if (!inline?.data) {
    ctx?.log?.('warn', 'gemini.image_generate_no_inline', { keys: Object.keys(json || {}) })
    throw new Error('Gemini image generation returned no inlineData')
  }

  const mime = inline.mimeType || 'image/png'
  return `data:${mime};base64,${inline.data}`
}
