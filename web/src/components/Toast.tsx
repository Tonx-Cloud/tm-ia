import { useEffect } from 'react'

export type ToastMessage = {
  id: string
  type: 'error' | 'success' | 'info'
  text: string
}

type Props = {
  message: ToastMessage
  onClose: (id: string) => void
}

export function Toast({ message, onClose }: Props) {
  useEffect(() => {
    const t = setTimeout(() => onClose(message.id), 4000)
    return () => clearTimeout(t)
  }, [message.id, onClose])

  return (
    <div
      style={{
        background: message.type === 'error' ? '#2b0f13' : '#0f1a2b',
        border: '1px solid rgba(255,255,255,0.08)',
        color: '#fff',
        padding: '12px 14px',
        borderRadius: 12,
        boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
        minWidth: 280,
      }}
    >
      {message.text}
    </div>
  )
}
