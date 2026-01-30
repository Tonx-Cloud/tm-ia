const API = import.meta.env.VITE_API_BASE || ''

export type Asset = {
  id: string
  prompt: string
  status: 'generated' | 'reused' | 'needs_regen'
  dataUrl: string
}

export type StoryboardItem = {
  assetId: string
  durationSec: number
  animate: boolean
  position?: string
}

export type ProjectResp = {
  project: {
    id: string
    assets: Asset[]
    storyboard: StoryboardItem[]
  }
  cost?: number
}

export type GenerateResp = ProjectResp & { added?: number; cost?: number }
export type BalanceResp = { balance: number }

export async function fetchBalance(token: string): Promise<BalanceResp> {
  const res = await fetch(`${API}/api/credits`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch balance')
  const body = (await res.json()) as BalanceResp & { recentEntries?: any }
  return { balance: body.balance }
}

export async function createProject(name: string, token: string): Promise<{ ok: true; projectId: string; project: any }> {
  const res = await fetch(`${API}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || 'Failed to create project')
  }
  return body
}

export async function unlockPreview(projectId: string, token: string, cost = 8) {
  const res = await fetch(`${API}/api/demo/unlock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId, cost }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Unlock failed')
  }
  return (await res.json()) as { ok: true; balance: number }
}

export async function generateAssets(prompt: string, count: number, token: string, projectId?: string): Promise<GenerateResp> {
  const res = await fetch(`${API}/api/assets/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ prompt, count, projectId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to generate assets')
  }
  return (await res.json()) as GenerateResp
}

export async function uploadAudio(
  file: File,
  token: string,
  opts?: { projectId?: string }
): Promise<{ ok: boolean; projectId: string; audioUrl?: string; filePath: string; filename: string; size: number; mime: string }> {
  // IMPORTANT: avoid Vercel 413 by uploading directly from the browser to Vercel Blob.
  // Server only issues the token.
  const { upload } = await import('@vercel/blob/client')

  const projectId =
    opts?.projectId ||
    (await createProject(`Projeto ${new Date().toLocaleString()}`, token)).projectId

  const ext = (file.name || 'audio').split('.').pop() || 'audio'
  const safeName = (file.name || `audio.${ext}`).replace(/[^a-zA-Z0-9._-]/g, '_')
  const pathname = `audio/${projectId}/${Date.now()}-${safeName}`

  const blob = await upload(pathname, file, {
    access: 'public',
    handleUploadUrl: `${API}/api/blob/upload`,
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })

  return {
    ok: true,
    projectId,
    audioUrl: blob.url,
    filePath: '',
    filename: file.name || safeName,
    size: file.size,
    mime: file.type,
  }
}

export async function analyzeAudio(file: File, durationSeconds: number, token: string, existingProjectId?: string) {
  // Upload to Blob first, then analyze by URL. If that fails, fall back to multipart.
  const upload = await uploadAudio(file, token, { projectId: existingProjectId })

  if (upload.audioUrl) {
    const res = await fetch(`${API}/api/demo/analyze`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        projectId: existingProjectId || upload.projectId,
        durationSeconds,
        audioUrl: upload.audioUrl,
        audioFilename: upload.filename,
        audioMime: upload.mime,
      }),
    })

    if (res.ok) {
      return res.json() as Promise<{
        projectId: string
        status: string
        transcription: string
        hookText: string
        hookStart: number
        hookEnd: number
        mood: string
        genre: string
        balance: number
        audioUrl?: string
      }>
    }

    // If URL analysis fails, fall back to multipart.
    console.warn('[analyzeAudio] analyze-by-url failed; falling back to multipart')
  }

  const formData = new FormData()
  formData.append('audio', file)
  formData.append('durationSeconds', String(durationSeconds))
  formData.append('projectId', existingProjectId || upload.projectId)

  const res = await fetch(`${API}/api/demo/analyze`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Analysis failed')
  }

  return res.json() as Promise<{
    projectId: string
    status: string
    transcription: string
    hookText: string
    hookStart: number
    hookEnd: number
    mood: string
    genre: string
    balance: number
    audioUrl?: string
  }>
}

export async function fetchProject(projectId: string, token: string) {
  const res = await fetch(`${API}/api/assets?projectId=${projectId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error('Failed to fetch project')
  return (await res.json()) as ProjectResp
}

export async function updateStoryboard(projectId: string, storyboard: StoryboardItem[], token: string) {
  const res = await fetch(`${API}/api/assets`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId, storyboard }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to update storyboard')
  }
  return (await res.json()) as ProjectResp
}

export async function snapshotRender(projectId: string, token: string) {
  const res = await fetch(`${API}/api/assets/snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Failed to snapshot render')
  }
  return (await res.json()) as { ok: boolean; reused: boolean; renderId: string; cost: number; snapshotHash: string }
}

export async function reuseAsset(projectId: string, assetId: string, token: string) {
  const res = await fetch(`${API}/api/assets/reuse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId, assetId }),
  })
  if (!res.ok) throw new Error('Reuse failed')
  return (await res.json()) as ProjectResp
}

export async function regenAsset(projectId: string, assetId: string, token: string, prompt?: string) {
  const res = await fetch(`${API}/api/assets/regen`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ projectId, assetId, prompt }),
  })
  if (!res.ok) throw new Error('Regenerate failed')
  return (await res.json()) as ProjectResp
}

// --- Auth Functions ---
export async function register(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error || 'Registration failed')
  }
  return body
}

export async function login(email: string, password: string): Promise<{ token: string }> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json()
  if (!res.ok) {
    throw new Error(body.error || 'Login failed')
  }
  return body
}
