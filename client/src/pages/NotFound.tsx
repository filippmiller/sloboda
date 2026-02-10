import { useNavigate } from 'react-router-dom'
import { Home, ArrowLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export default function NotFound() {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="text-6xl font-display font-bold text-accent/30">{t('notFound.code')}</div>
        <div>
          <h1 className="text-xl font-display font-semibold text-text mb-2">
            {t('notFound.title')}
          </h1>
          <p className="text-text-secondary text-sm leading-relaxed">
            {t('notFound.description')}
          </p>
        </div>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm rounded-lg border border-border text-text-secondary hover:text-text hover:border-text-muted transition-colors flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            {t('notFound.back')}
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="px-4 py-2 text-sm rounded-lg bg-accent text-white hover:bg-accent-hover transition-colors flex items-center gap-2"
          >
            <Home size={14} />
            {t('notFound.home')}
          </button>
        </div>
      </div>
    </div>
  )
}
