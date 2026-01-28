import { Component, type ErrorInfo, type ReactNode } from 'react'

type BoundaryState = { hasError: boolean; message?: string }

type Props = { children: ReactNode }

export class ErrorBoundary extends Component<Props, BoundaryState> {
  state: BoundaryState = { hasError: false, message: undefined }

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { hasError: true, message: error.message }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('ErrorBoundary', error, info)
    }
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, minHeight: '100vh', background: '#0b0b12', color: '#f5f6fa' }}>
          <h1 style={{ margin: 0, fontSize: 22 }}>Algo deu errado</h1>
          <p style={{ marginTop: 8, color: '#cbd2e1' }}>Tente novamente. Se persistir, reporte o erro.</p>
          {this.state.message && <div style={{ marginTop: 10, fontSize: 12, color: '#9fb0c8' }}>{this.state.message}</div>}
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 16,
              padding: '10px 14px',
              background: 'linear-gradient(120deg, #ff7b7b, #a855f7)',
              border: 'none',
              color: '#fff',
              borderRadius: 10,
              cursor: 'pointer',
              fontWeight: 700,
            }}
          >
            Tentar novamente
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
