import { useEffect, useState } from 'react'
import { fetchPackages, type PricingResponse } from '@/lib/pricing-api'

type Props = {
  token?: string
  onSelectPackage: (packageId: string) => void
  loading?: boolean
}

export function CreditPackages({ token, onSelectPackage, loading: parentLoading }: Props) {
  const [data, setData] = useState<PricingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchPackages(token)
      .then(setData)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [token])

  if (loading) return <div style={{ padding: 20, textAlign: 'center' }}>Loading packages...</div>
  if (error) return <div style={{ color: 'var(--error)', padding: 20 }}>Error: {error}</div>
  if (!data) return null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
      {data.packages.map(pkg => (
        <div 
          key={pkg.id}
          style={{ 
            border: '1px solid var(--border)', 
            borderRadius: 8, 
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
            background: 'var(--surface)'
          }}
        >
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{pkg.name}</div>
          
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
            <span style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--primary)' }}>
              {pkg.credits}
            </span>
            <span style={{ fontSize: '0.9rem', opacity: 0.7 }}>credits</span>
          </div>
          
          <div style={{ fontSize: '1.1rem', fontWeight: 600 }}>
            ${pkg.priceUSD.toFixed(2)}
          </div>
          
          {pkg.discount > 0 && (
            <div style={{ 
              fontSize: '0.8rem', 
              color: '#4caf50', 
              background: 'rgba(76,175,80,0.1)', 
              padding: '2px 6px', 
              borderRadius: 4,
              alignSelf: 'start'
            }}>
              Save ${pkg.savingsUSD.toFixed(2)} ({pkg.discount}% off)
            </div>
          )}
          
          <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', flex: 1 }}>
            {pkg.description}
          </div>
          
          <button 
            className="btn-primary" 
            style={{ marginTop: 8 }}
            onClick={() => onSelectPackage(pkg.id)}
            disabled={parentLoading}
          >
            Buy Now
          </button>
        </div>
      ))}
      <div style={{ gridColumn: '1/-1', textAlign: 'center', fontSize: '0.8rem', opacity: 0.5, marginTop: 8 }}>
        {data.rate.description}
      </div>
    </div>
  )
}
