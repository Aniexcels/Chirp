import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface State {
  error: Error | null
}

/** Renders a message instead of a blank page when a render throws. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('render failed', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="boundary">
        <h1>Chirp hit a snag</h1>
        <p className="error">{error.message || 'something went wrong'}</p>
        <button className="primary" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    )
  }
}
