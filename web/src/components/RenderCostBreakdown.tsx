type CostBreakdownProps = {
  breakdown: {
    images: number
    animation: number
    render: number
    export4k: number
    watermark: number
    total: number
  }
}

export function RenderCostBreakdown({ breakdown }: CostBreakdownProps) {
  return (
    <div style={{ 
      background: 'rgba(0,0,0,0.2)', 
      borderRadius: 8, 
      padding: 12,
      fontSize: '0.9rem',
      margin: '10px 0'
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
        Render Cost Breakdown
      </div>
      
      <div style={{ display: 'grid', gap: 4 }}>
        {breakdown.images > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>New Images</span>
            <span>{breakdown.images} cr</span>
          </div>
        )}
        
        {breakdown.animation > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Animation</span>
            <span>{breakdown.animation} cr</span>
          </div>
        )}
        
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>Video Rendering</span>
          <span>{breakdown.render} cr</span>
        </div>
        
        {breakdown.export4k > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>4K Export</span>
            <span>{breakdown.export4k} cr</span>
          </div>
        )}
        
        {breakdown.watermark > 0 && (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>Remove Watermark</span>
            <span>{breakdown.watermark} cr</span>
          </div>
        )}
        
        <div style={{ 
          borderTop: '1px solid var(--border)', 
          marginTop: 4, 
          paddingTop: 4,
          display: 'flex', 
          justifyContent: 'space-between',
          fontWeight: 'bold',
          color: 'var(--accent)'
        }}>
          <span>Total</span>
          <span>{breakdown.total} cr</span>
        </div>
      </div>
    </div>
  )
}
