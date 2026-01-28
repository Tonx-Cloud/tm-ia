import { useCallback, useEffect, useRef, useState } from 'react'

const API = import.meta.env.VITE_API_BASE || ''

export function useCredits(token?: string) {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState<boolean>(false)
  const [error, setError] = useState<string | null>(null)
  const pending = useRef(false)

  const fetchCredits = useCallback(async () => {
    if (!token || token.length < 10) return // Skip if no valid token
    if (pending.current) return
    pending.current = true
    setLoading(true)
    setError(null)
    try {
      const resp = await fetch(`${API}/api/credits`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      })
      if (!resp.ok) throw new Error(`credits fetch failed: ${resp.status}`)
      const json = await resp.json()
      setBalance(json.balance ?? 0)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      pending.current = false
      setLoading(false)
    }
  }, [token])

  useEffect(() => {
    fetchCredits()
  }, [fetchCredits])

  return { balance, loading, error, refetch: fetchCredits, setBalance }
}
