export type DemoStatus = 'idle' | 'processing' | 'ready'

export type DemoPreview = {
  status: DemoStatus
  hookText?: string
  previewUrl?: string
  reason?: string
}

const API = import.meta.env.VITE_API_BASE || ''

export async function uploadDemo(
  file: File,
  authToken?: string,
): Promise<{ projectId: string; filePath: string; filename?: string }> {
  const form = new FormData()
  form.append('audio', file)
  const res = await fetch(`${API}/api/upload`, {
    method: 'POST',
    body: form,
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  return res.json()
}

export async function checkDemoCooldown(authToken?: string): Promise<{ blocked: boolean; retryInSeconds?: number; unauth?: boolean }> {
  const res = await fetch(`${API}/api/demo/status`, {
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
  })
  if (res.status === 401) return { blocked: true, unauth: true }
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}))
    return { blocked: true, retryInSeconds: body.retryInSeconds ?? 0 }
  }
  return { blocked: false }
}

export async function requestDemoAnalysis(filePath: string, projectId: string, authToken?: string) {
  const res = await fetch(`${API}/api/demo/analyze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ filePath, projectId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Analysis failed')
  }
  return res.json() as Promise<{
    projectId: string
    status: string
    transcription: string
    segments?: { start: number; end: number; text: string }[]
    summary?: string
    mood?: string
    genre?: string
    hookText: string
    hookStart: number
    hookEnd: number
    hookConfidence: number
  }>
}
