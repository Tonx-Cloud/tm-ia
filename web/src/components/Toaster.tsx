import { useCallback, useState } from 'react'
import type { ToastMessage } from './Toast'
import { Toast } from './Toast'

export function useToaster() {
  const [messages, setMessages] = useState<ToastMessage[]>([])

  const push = useCallback((msg: Omit<ToastMessage, 'id'>) => {
    setMessages((prev) => [...prev, { ...msg, id: crypto.randomUUID() }])
  }, [])

  const remove = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id))
  }, [])

  const ToastContainer = useCallback(() => {
    return (
      <div
        style={{
          position: 'fixed',
          top: 16,
          right: 16,
          display: 'grid',
          gap: 10,
          zIndex: 100,
        }}
      >
        {messages.map((m) => (
          <Toast key={m.id} message={m} onClose={remove} />
        ))}
      </div>
    )
  }, [messages, remove])

  return { push, ToastContainer }
}
