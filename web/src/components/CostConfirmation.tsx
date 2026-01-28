import { useEffect, useState } from 'react'
import { estimateCost, type EstimateResponse, type RenderCostConfig } from '@/lib/pricing-api'
import { RenderCostBreakdown } from './RenderCostBreakdown'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: () => void
  onTopUp?: () => void
  token?: string
  title?: string
  
  // Estimation params
  action: string
  quantity?: number
  audioDurationSeconds?: number
  renderConfig?: RenderCostConfig
}

export function CostConfirmation({ 
  open, 
  onClose, 
  onConfirm, 
  onTopUp,
  token, 
  title,
  action,
  quantity,
  audioDurationSeconds,
  renderConfig 
}: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [estimate, setEstimate] = useState<EstimateResponse | null>(null)

  useEffect(() => {
    if (open && token) {
      setLoading(true)
      setError(null)
      estimateCost(token, { action, quantity, audioDurationSeconds, renderConfig })
        .then(setEstimate)
        .catch(err => setError(err.message))
        .finally(() => setLoading(false))
    }
  }, [open, token, action, quantity, audioDurationSeconds, JSON.stringify(renderConfig)])

  if (!open) return null

  const handleConfirm = () => {
    onConfirm()
    onClose()
  }

  const handleTopUp = () => {
    onTopUp?.()
    // Don't close, user might come back after top-up (or top-up modal handles logic)
  }

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ maxWidth: 400 }}>
        <div className="modal-header">
          <div style={{ fontWeight: 700 }}>{title || 'Confirm Action'}</div>
          <button className="btn-ghost" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center' }}>Calculating cost...</div>
          ) : error ? (
            <div style={{ color: 'var(--error)', padding: 10 }}>Error: {error}</div>
          ) : estimate ? (
            <div style={{ display: 'grid', gap: 16 }}>
              
              {estimate.breakdown ? (
                <RenderCostBreakdown breakdown={estimate.breakdown} />
              ) : (
                <div style={{ 
                  background: 'rgba(0,0,0,0.2)', 
                  padding: 16, 
                  borderRadius: 8,
                  textAlign: 'center' 
                }}>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>Cost</div>
                  <div style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--accent)' }}>
                    {estimate.cost} credits
                  </div>
                  <div style={{ fontSize: '0.8rem', opacity: 0.7 }}>
                    ({estimate.display.usd})
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.9rem' }}>
                <span>Your Balance:</span>
                <span style={{ fontWeight: 600 }}>{estimate.balance} cr</span>
              </div>

              {!estimate.canAfford && (
                <div style={{ 
                  color: '#ff6b6b', 
                  fontSize: '0.9rem', 
                  textAlign: 'center',
                  background: 'rgba(255,107,107,0.1)',
                  padding: 8,
                  borderRadius: 4
                }}>
                  Insufficient balance. You need {estimate.insufficientBy} more credits.
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <button className="btn-ghost" style={{ flex: 1 }} onClick={onClose}>
                  Cancel
                </button>
                
                {estimate.canAfford ? (
                  <button className="btn-primary" style={{ flex: 1 }} onClick={handleConfirm}>
                    Confirm ({estimate.cost})
                  </button>
                ) : (
                  <button className="btn-primary" style={{ flex: 1 }} onClick={handleTopUp}>
                    Buy Credits
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
