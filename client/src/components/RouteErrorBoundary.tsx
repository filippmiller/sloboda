import { Component, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import i18n from '@/i18n'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class RouteErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Route error:', error, errorInfo)
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center p-8 min-h-[40vh]">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center mx-auto">
              <AlertTriangle className="text-accent" size={24} />
            </div>
            <div>
              <h2 className="text-lg font-display font-semibold text-text mb-1">
                {i18n.t('errorBoundary.title')}
              </h2>
              <p className="text-text-secondary text-sm">
                {i18n.t('errorBoundary.description')}
              </p>
            </div>
            {this.state.error && (
              <pre className="text-xs text-text-muted bg-bg-card border border-border rounded-lg p-2 text-left overflow-auto max-h-24">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw size={14} />
              {i18n.t('errorBoundary.retry')}
            </button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}
