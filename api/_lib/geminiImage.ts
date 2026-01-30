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

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    // Many image models require explicitly requesting IMAGE modality.
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
