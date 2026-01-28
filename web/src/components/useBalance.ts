import { useEffect, useState } from 'react'
import { fetchBalance } from '@/lib/assetsApi'

export function useBalance(token: string | undefined) {
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!token || token.length < 10) return // Skip if no valid token
    const load = async () => {
      setLoading(true)
      try {
        const resp = await fetchBalance(token)
        setBalance(resp.balance)
      } catch (err) {
        console.error(err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [token])

  return { balance, setBalance, loading }
}
