import { useState } from 'react'
import { CostConfirmation } from '@/components/CostConfirmation'

interface Props {
  onGenerated: (projectId: string, assets: { id: string; prompt: string; status: 'generated'; dataUrl: string }[], cost: number) => void
  onEstimate: (estimate: number) => void
  authToken?: string
  apiBase: string
  onTopUp?: () => void
}

const COST_PER_IMAGE = 30 // créditos

export function ImageGenerator({ onGenerated, onEstimate, authToken, apiBase, onTopUp }: Props) {
  const [count, setCount] = useState(4)
  const [prompt, setPrompt] = useState('Cinematic music video still, neon lights')
  const [loading, setLoading] = useState(false)
  const [lastCost, setLastCost] = useState<number | null>(null)
  const [confirmOpen, setConfirmOpen] = useState(false)

  const estimate = count * COST_PER_IMAGE

  const handleGen = async () => {
    setLoading(true)
    onEstimate(estimate)
    try {
      const res = await fetch(`${apiBase}/api/assets/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({ prompt, count }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({}))
        throw new Error(err.error || 'Generation failed')
      }
      const body = await res.json()
      const finalCost = body.cost ?? estimate
      setLastCost(finalCost)
      onGenerated(body.project.id, body.project.assets, finalCost)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Gerar imagens (4–24)</div>
      <div style={{ display: 'grid', gap: 10 }}>
        <label>
          Prompt
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            style={{ width: '100%', minHeight: 80, marginTop: 6 }}
          />
        </label>
        <label>
          Quantidade
          <input
            type="number"
            min={4}
            max={24}
            value={count}
            onChange={(e) => setCount(Math.min(24, Math.max(4, Number(e.target.value) || 4)))}
            style={{ width: '100%', marginTop: 6 }}
          />
        </label>
        <div className="badge-soft">Estimado: {estimate} créditos</div>
        {lastCost !== null && <div className="badge-soft">Cobrado: {lastCost} créditos</div>}
        
        <button className="btn-primary" onClick={() => setConfirmOpen(true)} disabled={loading}>
          {loading ? 'Gerando...' : `Gerar imagens (${estimate} cr)`}
        </button>
      </div>

      <CostConfirmation
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={handleGen}
        onTopUp={onTopUp}
        token={authToken}
        title="Gerar Imagens"
        action="GENERATE_IMAGE"
        quantity={count}
      />
    </section>
  )
}
