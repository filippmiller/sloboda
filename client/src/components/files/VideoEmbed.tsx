import { useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Video, X, ExternalLink, Loader2 } from 'lucide-react'
import api from '@/services/api'
import Button from '@/components/ui/Button'

interface VideoData {
  provider: string
  videoId: string
  embedUrl: string
  thumbnailUrl: string | null
  originalUrl: string
}

interface VideoEmbedProps {
  onVideoAdded?: (video: VideoData) => void
  videos?: VideoData[]
  onVideoRemoved?: (index: number) => void
  maxVideos?: number
}

export default function VideoEmbed({
  onVideoAdded,
  videos = [],
  onVideoRemoved,
  maxVideos = 5,
}: VideoEmbedProps) {
  const { t } = useTranslation()
  const [url, setUrl] = useState('')
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')

  const handleAdd = useCallback(async () => {
    if (!url.trim()) return
    setError('')
    setParsing(true)

    try {
      const res = await api.post('/user/video/parse', { url: url.trim() })
      if (res.data.success) {
        onVideoAdded?.(res.data.video)
        setUrl('')
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { error?: string } } }
      setError(e.response?.data?.error || t('video.parseError', 'Could not parse video URL'))
    } finally {
      setParsing(false)
    }
  }, [url, t, onVideoAdded])

  const providerLabels: Record<string, string> = {
    youtube: 'YouTube',
    vimeo: 'Vimeo',
    rutube: 'RuTube',
  }

  return (
    <div className="space-y-3">
      {/* URL input */}
      {videos.length < maxVideos && (
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Video size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={t('video.placeholder', 'Paste YouTube, Vimeo, or RuTube URL...')}
              className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm placeholder:text-text-muted
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                transition-colors"
            />
          </div>
          <Button
            onClick={handleAdd}
            disabled={!url.trim() || parsing}
            size="sm"
          >
            {parsing ? <Loader2 size={14} className="animate-spin" /> : t('video.add', 'Add')}
          </Button>
        </div>
      )}
      {error && <p className="text-red-400 text-xs">{error}</p>}

      {/* Video list */}
      {videos.length > 0 && (
        <div className="space-y-2">
          {videos.map((video, idx) => (
            <div
              key={`${video.provider}-${video.videoId}`}
              className="rounded-lg border border-border overflow-hidden bg-bg-card"
            >
              {/* Embed iframe */}
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  src={video.embedUrl}
                  className="absolute inset-0 w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={`${video.provider} video`}
                />
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-between px-3 py-1.5 text-xs text-text-muted">
                <span className="font-medium">{providerLabels[video.provider] ?? video.provider}</span>
                <div className="flex items-center gap-1">
                  <a
                    href={video.originalUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1 rounded hover:bg-bg-elevated transition-colors"
                    title={t('video.openOriginal', 'Open original')}
                  >
                    <ExternalLink size={13} />
                  </a>
                  {onVideoRemoved && (
                    <button
                      onClick={() => onVideoRemoved(idx)}
                      className="p-1 rounded hover:bg-red-500/10 hover:text-red-400 transition-colors"
                      title={t('video.remove', 'Remove')}
                    >
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
