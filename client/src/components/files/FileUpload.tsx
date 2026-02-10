import { useState, useRef, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload, X, File, Image, FileText, Loader2, Trash2, Download, HardDrive } from 'lucide-react'
import api from '@/services/api'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'

interface UserFile {
  id: number
  original_filename: string
  mimetype: string
  size_bytes: number
  context: string
  description: string | null
  s3_key: string
  created_at: string
}

interface StorageInfo {
  used: number
  limit: number
  remaining: number
}

interface FileUploadProps {
  context?: string
  onFileUploaded?: (file: UserFile) => void
  onFileDeleted?: (fileId: number) => void
  compact?: boolean
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i]
}

function getFileIcon(mimetype: string) {
  if (mimetype.startsWith('image/')) return <Image size={16} className="text-blue-400" />
  if (mimetype === 'application/pdf') return <FileText size={16} className="text-red-400" />
  return <File size={16} className="text-text-muted" />
}

export default function FileUpload({
  context = 'general',
  onFileUploaded,
  onFileDeleted,
  compact = false,
}: FileUploadProps) {
  const { t } = useTranslation()
  const [files, setFiles] = useState<UserFile[]>([])
  const [storage, setStorage] = useState<StorageInfo | null>(null)
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchFiles = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/user/files', { params: { context } })
      setFiles(res.data.data ?? [])
      setStorage(res.data.storage ?? null)
      setLoaded(true)
    } catch {
      toast.error(t('files.loadError', 'Failed to load files'))
    } finally {
      setLoading(false)
    }
  }, [context, t])

  // Load on first render
  if (!loaded && !loading) {
    fetchFiles()
  }

  const handleUpload = useCallback(async (file: globalThis.File) => {
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('context', context)

      const res = await api.post('/user/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      if (res.data.success) {
        toast.success(t('files.uploaded', 'File uploaded'))
        onFileUploaded?.(res.data.file)
        fetchFiles()
      }
    } catch (err: unknown) {
      const error = err as { response?: { status?: number; data?: { error?: string } } }
      if (error.response?.status === 413) {
        toast.error(t('files.quotaExceeded', 'Storage quota exceeded'))
      } else {
        toast.error(error.response?.data?.error || t('files.uploadError', 'Upload failed'))
      }
    } finally {
      setUploading(false)
    }
  }, [context, t, onFileUploaded, fetchFiles])

  const handleDelete = useCallback(async (fileId: number) => {
    try {
      await api.delete(`/user/files/${fileId}`)
      toast.success(t('files.deleted', 'File deleted'))
      onFileDeleted?.(fileId)
      fetchFiles()
    } catch {
      toast.error(t('files.deleteError', 'Failed to delete file'))
    }
  }, [t, onFileDeleted, fetchFiles])

  const handleDownload = useCallback(async (fileId: number, filename: string) => {
    try {
      const res = await api.get(`/user/files/${fileId}/download`)
      const link = document.createElement('a')
      link.href = res.data.downloadUrl
      link.download = filename
      link.target = '_blank'
      link.click()
    } catch {
      toast.error(t('files.downloadError', 'Failed to download file'))
    }
  }, [t])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const droppedFile = e.dataTransfer.files[0]
    if (droppedFile) handleUpload(droppedFile)
  }, [handleUpload])

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0]
    if (selected) handleUpload(selected)
    e.target.value = ''
  }, [handleUpload])

  const usagePercent = storage ? Math.round((storage.used / storage.limit) * 100) : 0

  return (
    <div className="space-y-3">
      {/* Storage meter */}
      {storage && !compact && (
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <HardDrive size={13} />
          <div className="flex-1">
            <div className="flex justify-between mb-1">
              <span>{formatBytes(storage.used)} / {formatBytes(storage.limit)}</span>
              <span>{usagePercent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg-elevated overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  usagePercent > 90 ? 'bg-red-500' : usagePercent > 70 ? 'bg-yellow-500' : 'bg-accent'
                }`}
                style={{ width: `${Math.min(usagePercent, 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`
          border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-colors
          ${dragOver ? 'border-accent bg-accent/5' : 'border-border hover:border-text-muted'}
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={fileRef}
          type="file"
          onChange={onFileChange}
          className="hidden"
          accept=".jpg,.jpeg,.png,.webp,.gif,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z"
        />
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-text-muted">
            <Loader2 size={18} className="animate-spin" />
            <span className="text-sm">{t('files.uploading', 'Uploading...')}</span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-1.5 text-text-muted">
            <Upload size={20} />
            <span className="text-sm">{t('files.dropOrClick', 'Drop file or click to upload')}</span>
            <span className="text-xs">{t('files.maxSize', 'Max 20 MB per file')}</span>
          </div>
        )}
      </div>

      {/* File list */}
      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 size={18} className="animate-spin text-text-muted" />
        </div>
      ) : files.length > 0 ? (
        <ul className="space-y-1.5">
          {files.map((f) => (
            <li
              key={f.id}
              className="flex items-center gap-2 p-2 rounded-lg bg-bg-card border border-border/50 text-sm group"
            >
              {getFileIcon(f.mimetype)}
              <span className="flex-1 truncate text-text-secondary">{f.original_filename}</span>
              <span className="text-text-muted text-xs whitespace-nowrap">{formatBytes(f.size_bytes)}</span>
              <button
                onClick={() => handleDownload(f.id, f.original_filename)}
                className="p-1 rounded hover:bg-bg-elevated text-text-muted hover:text-text transition-colors opacity-0 group-hover:opacity-100"
                title={t('files.download', 'Download')}
              >
                <Download size={14} />
              </button>
              <button
                onClick={() => handleDelete(f.id)}
                className="p-1 rounded hover:bg-red-500/10 text-text-muted hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                title={t('files.delete', 'Delete')}
              >
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      ) : loaded ? (
        <p className="text-text-muted text-xs text-center py-2">
          {t('files.noFiles', 'No files uploaded yet')}
        </p>
      ) : null}
    </div>
  )
}
