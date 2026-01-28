export async function requestPreview(filePath: string, hook: string, style: string, authToken?: string) {
  const API = import.meta.env.VITE_API_BASE || ''
  const res = await fetch(`${API}/api/demo/preview`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ filePath, hook, style }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Preview failed')
  }
  return res.json() as Promise<{ previewUrl: string; requestId?: string }>
}
