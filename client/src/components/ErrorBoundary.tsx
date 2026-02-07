import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  handleReload = () => {
    window.location.reload()
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-bg flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="text-accent" size={32} />
            </div>
            <div>
              <h1 className="text-xl font-display font-semibold text-text mb-2">
                Что-то пошло не так
              </h1>
              <p className="text-text-secondary text-sm leading-relaxed">
                Произошла непредвиденная ошибка. Попробуйте обновить страницу.
              </p>
            </div>
            {this.state.error && (
              <pre className="text-xs text-text-muted bg-bg-card border border-border rounded-lg p-3 text-left overflow-auto max-h-32">
                {this.state.error.message}
              </pre>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:border-text-muted transition-colors"
              >
                Попробовать снова
              </button>
              <button
                onClick={this.handleReload}
                className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors flex items-center gap-2"
              >
                <RefreshCw size={14} />
                Обновить страницу
              </button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
