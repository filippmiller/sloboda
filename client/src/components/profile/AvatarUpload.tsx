import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Camera, X, Loader2, Upload } from 'lucide-react'

interface AvatarUploadProps {
  currentUrl?: string | null
  onUpload: (file: File) => Promise<string | void>
  onRemove?: () => Promise<void>
  size?: 'md' | 'lg'
}

export default function AvatarUpload({
  currentUrl,
  onUpload,
  onRemove,
  size = 'lg',
}: AvatarUploadProps) {
  const { t } = useTranslation()
  const [preview, setPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const displayUrl = preview || currentUrl

  const sizeClasses = size === 'lg' ? 'w-32 h-32' : 'w-20 h-20'
  const iconSize = size === 'lg' ? 32 : 20

  const handleFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return
    if (file.size > 5 * 1024 * 1024) return

    const reader = new FileReader()
    reader.onload = (e) => setPreview(e.target?.result as string)
    reader.readAsDataURL(file)

    setUploading(true)
    try {
      await onUpload(file)
    } catch {
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }, [onUpload])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleRemove = async () => {
    if (!onRemove) return
    setUploading(true)
    try {
      await onRemove()
      setPreview(null)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className={`
          relative ${sizeClasses} rounded-full overflow-hidden
          bg-bg-elevated border-2 border-dashed
          ${dragOver ? 'border-accent scale-105' : 'border-border'}
          transition-all duration-200 cursor-pointer group
        `}
        onClick={() => !uploading && fileRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {displayUrl ? (
          <>
            <img
              src={displayUrl}
              alt="Avatar"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <Camera size={iconSize} className="text-white" />
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center text-text-muted">
            {uploading ? (
              <Loader2 size={iconSize} className="animate-spin" />
            ) : (
              <Upload size={iconSize} />
            )}
          </div>
        )}

        {uploading && displayUrl && (
          <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
            <Loader2 size={iconSize} className="animate-spin text-white" />
          </div>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0]
          if (file) handleFile(file)
          e.target.value = ''
        }}
      />

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="text-xs text-accent hover:text-accent-hover transition-colors disabled:opacity-50"
        >
          {displayUrl ? t('onboarding.changePhoto') : t('onboarding.uploadPhoto')}
        </button>
        {displayUrl && onRemove && (
          <>
            <span className="text-text-muted text-xs">|</span>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs text-text-muted hover:text-red-400 transition-colors disabled:opacity-50"
            >
              <X size={12} className="inline mr-0.5" />
              {t('onboarding.removePhoto')}
            </button>
          </>
        )}
      </div>

      <p className="text-xs text-text-muted text-center">
        {t('onboarding.maxFileSize')}
      </p>
    </div>
  )
}
