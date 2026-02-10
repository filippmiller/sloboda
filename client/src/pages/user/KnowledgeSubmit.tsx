import { useState, useEffect, useCallback, useRef, type ChangeEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm, Controller } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useDropzone } from 'react-dropzone'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import ImageExtension from '@tiptap/extension-image'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useDateLocale } from '@/hooks/useDateLocale'
import {
  Upload,
  FileText,
  X,
  Bold,
  Italic,
  Heading2,
  List,
  Link2,
  ImageIcon,
  Loader2,
  Clock,
  CheckCircle,
  XCircle,
  Eye,
  BookCheck,
} from 'lucide-react'
import api from '@/services/api'
import type { KnowledgeSubmission, Category } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const MAX_FILES = 5
const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

type SubmitForm = {
  title: string
  description: string
  category_id?: string
  body: string
}

const statusIcons: Record<string, { icon: typeof Clock; color: string }> = {
  pending: { icon: Clock, color: 'text-yellow-400' },
  reviewing: { icon: Eye, color: 'text-blue-400' },
  approved: { icon: CheckCircle, color: 'text-green' },
  rejected: { icon: XCircle, color: 'text-red-400' },
  published: { icon: BookCheck, color: 'text-green' },
}

function ToolbarButton({
  onClick,
  active,
  children,
  title,
}: {
  onClick: () => void
  active?: boolean
  children: React.ReactNode
  title: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`
        p-1.5 rounded transition-colors
        ${active ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}
      `}
    >
      {children}
    </button>
  )
}

export default function KnowledgeSubmit() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  const submitSchema = z.object({
    title: z.string().min(3, t('submit.validation.titleMin3')),
    description: z.string().min(10, t('submit.validation.descriptionMin10')),
    category_id: z.string().optional(),
    body: z.string().min(20, t('submit.validation.bodyTooShort')),
  })

  const [categories, setCategories] = useState<Category[]>([])
  const [files, setFiles] = useState<File[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mySubmissions, setMySubmissions] = useState<KnowledgeSubmission[]>([])
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [hasDraft, setHasDraft] = useState(false)
  const [draftSaved, setDraftSaved] = useState(false)
  const draftTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const form = useForm<SubmitForm>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      title: '',
      description: '',
      category_id: '',
      body: '',
    },
  })

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-accent underline',
        },
      }),
      ImageExtension.configure({ inline: false }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class:
          'min-h-[200px] px-4 py-3 text-sm text-text focus:outline-none prose prose-invert prose-sm max-w-none',
      },
    },
    onUpdate: ({ editor: ed }) => {
      form.setValue('body', ed.getHTML(), { shouldValidate: true })
    },
  })

  const editorImageRef = useRef<HTMLInputElement>(null)

  const handleEditorImageUpload = () => {
    editorImageRef.current?.click()
  }

  const onEditorImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !editor) return

    const fd = new FormData()
    fd.append('image', file)

    try {
      const res = await api.post('/user/upload/image', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      const url = res.data.url
      editor.chain().focus().setImage({ src: url }).run()
    } catch {
      toast.error(t('common.errors.unknownError'))
    }

    e.target.value = ''
  }

  // Fetch categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await api.get('/user/categories')
        setCategories(response.data.data ?? response.data ?? [])
      } catch {
        // Non-critical
      }
    }
    fetchCategories()
  }, [])

  // Fetch my submissions
  const fetchMySubmissions = useCallback(async () => {
    setLoadingSubmissions(true)
    try {
      const response = await api.get('/user/knowledge/my')
      setMySubmissions(response.data.data ?? response.data ?? [])
    } catch {
      // Non-critical
    } finally {
      setLoadingSubmissions(false)
    }
  }, [])

  useEffect(() => {
    fetchMySubmissions()
  }, [fetchMySubmissions])

  // Check for saved draft on mount
  useEffect(() => {
    const saved = localStorage.getItem('knowledge_draft')
    if (saved) setHasDraft(true)
  }, [])

  // Auto-save draft every 30 seconds
  useEffect(() => {
    draftTimerRef.current = setInterval(() => {
      const values = form.getValues()
      if (values.title || values.description || values.body) {
        localStorage.setItem('knowledge_draft', JSON.stringify(values))
        setDraftSaved(true)
        setTimeout(() => setDraftSaved(false), 2000)
      }
    }, 30000)
    return () => {
      if (draftTimerRef.current) clearInterval(draftTimerRef.current)
    }
  }, [form])

  const restoreDraft = () => {
    const saved = localStorage.getItem('knowledge_draft')
    if (saved) {
      try {
        const data = JSON.parse(saved)
        form.setValue('title', data.title || '')
        form.setValue('description', data.description || '')
        form.setValue('category_id', data.category_id || '')
        form.setValue('body', data.body || '')
        if (editor && data.body) editor.commands.setContent(data.body)
      } catch {
        // Ignore malformed draft
      }
    }
    setHasDraft(false)
  }

  const discardDraft = () => {
    localStorage.removeItem('knowledge_draft')
    setHasDraft(false)
  }

  // File drop
  const onDrop = useCallback(
    (accepted: File[]) => {
      const remaining = MAX_FILES - files.length
      if (remaining <= 0) {
        toast.error(t('submit.validation.maxFiles', { max: MAX_FILES }))
        return
      }
      const toAdd = accepted.slice(0, remaining)
      const oversized = toAdd.filter((f) => f.size > MAX_FILE_SIZE)
      if (oversized.length > 0) {
        toast.error(t('submit.validation.maxFileSize'))
        return
      }
      setFiles((prev) => [...prev, ...toAdd])
    },
    [files.length],
  )

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    maxFiles: MAX_FILES,
    maxSize: MAX_FILE_SIZE,
  })

  const removeFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} Б`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
    return `${(bytes / (1024 * 1024)).toFixed(1)} МБ`
  }

  const handleSubmit = async (data: SubmitForm) => {
    setIsSubmitting(true)
    try {
      const formData = new FormData()
      formData.append('title', data.title)
      formData.append('description', data.description)
      formData.append('body', data.body)
      if (data.category_id) {
        formData.append('suggested_category_id', data.category_id)
      }
      files.forEach((file) => {
        formData.append('files', file)
      })

      await api.post('/user/knowledge', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })

      toast.success(t('submit.toasts.submitted'))
      localStorage.removeItem('knowledge_draft')
      form.reset()
      editor?.commands.clearContent()
      setFiles([])
      fetchMySubmissions()
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('common.errors.unknownError')
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  const setLink = () => {
    if (!editor) return
    const previousUrl = editor.getAttributes('link').href as string | undefined
    const url = window.prompt(t('submit.form.linkPrompt'), previousUrl ?? '')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">{t('submit.title')}</h1>
        <p className="text-text-secondary text-sm">
          {t('submit.subtitle')}
        </p>
      </div>

      {/* Draft banner */}
      {hasDraft && (
        <Card className="border-accent/30 bg-accent/5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-text-secondary">{t('submit.draft.hasDraft')}</p>
            <div className="flex gap-2">
              <Button size="sm" onClick={restoreDraft}>{t('common.actions.restore')}</Button>
              <Button size="sm" variant="secondary" onClick={discardDraft}>{t('common.actions.discard')}</Button>
            </div>
          </div>
        </Card>
      )}

      {/* Submission form */}
      <Card padding="lg">
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-5">
          <Input
            label={t('submit.form.titleLabel')}
            placeholder={t('submit.form.titlePlaceholder')}
            {...form.register('title')}
            error={form.formState.errors.title?.message}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('submit.form.descriptionLabel')}
            </label>
            <textarea
              placeholder={t('submit.form.descriptionPlaceholder')}
              rows={3}
              {...form.register('description')}
              className="
                w-full px-3 py-2 rounded-lg
                bg-bg-card border border-border
                text-text placeholder:text-text-muted
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                transition-colors duration-150 text-sm resize-none
              "
            />
            {form.formState.errors.description?.message && (
              <p className="text-xs text-red-400">
                {form.formState.errors.description.message}
              </p>
            )}
          </div>

          {categories.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">
                {t('submit.form.categoryLabel')}
              </label>
              <select
                {...form.register('category_id')}
                className="
                  w-full px-3 py-2 rounded-lg
                  bg-bg-card border border-border
                  text-text
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
                  transition-colors duration-150 text-sm
                "
              >
                <option value="">{t('submit.form.categoryDefault')}</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Rich text editor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('submit.form.contentLabel')}
            </label>
            <Controller
              name="body"
              control={form.control}
              render={() => (
                <div className="border border-border rounded-lg overflow-hidden bg-bg-card">
                  {/* Toolbar */}
                  {editor && (
                    <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-border bg-bg-elevated">
                      <ToolbarButton
                        onClick={() => editor.chain().focus().toggleBold().run()}
                        active={editor.isActive('bold')}
                        title={t('submit.toolbar.bold')}
                      >
                        <Bold size={16} />
                      </ToolbarButton>
                      <ToolbarButton
                        onClick={() =>
                          editor.chain().focus().toggleItalic().run()
                        }
                        active={editor.isActive('italic')}
                        title={t('submit.toolbar.italic')}
                      >
                        <Italic size={16} />
                      </ToolbarButton>
                      <div className="w-px h-5 bg-border mx-1" />
                      <ToolbarButton
                        onClick={() =>
                          editor
                            .chain()
                            .focus()
                            .toggleHeading({ level: 2 })
                            .run()
                        }
                        active={editor.isActive('heading', { level: 2 })}
                        title={t('submit.toolbar.heading')}
                      >
                        <Heading2 size={16} />
                      </ToolbarButton>
                      <ToolbarButton
                        onClick={() =>
                          editor.chain().focus().toggleBulletList().run()
                        }
                        active={editor.isActive('bulletList')}
                        title={t('submit.toolbar.list')}
                      >
                        <List size={16} />
                      </ToolbarButton>
                      <div className="w-px h-5 bg-border mx-1" />
                      <ToolbarButton
                        onClick={setLink}
                        active={editor.isActive('link')}
                        title={t('submit.toolbar.link')}
                      >
                        <Link2 size={16} />
                      </ToolbarButton>
                      <ToolbarButton
                        onClick={handleEditorImageUpload}
                        title={t('submit.toolbar.image')}
                      >
                        <ImageIcon size={16} />
                      </ToolbarButton>
                      <input
                        ref={editorImageRef}
                        type="file"
                        accept="image/*"
                        onChange={onEditorImageChange}
                        className="hidden"
                      />
                    </div>
                  )}
                  <EditorContent editor={editor} />
                </div>
              )}
            />
            {form.formState.errors.body?.message && (
              <p className="text-xs text-red-400">
                {form.formState.errors.body.message}
              </p>
            )}
          </div>

          {/* File upload */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('submit.form.attachmentsLabel', { max: MAX_FILES })}
            </label>
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-lg p-6 text-center cursor-pointer
                transition-colors duration-150
                ${
                  isDragActive
                    ? 'border-accent bg-accent/5'
                    : 'border-border hover:border-border-hover'
                }
              `}
            >
              <input {...getInputProps()} />
              <Upload className="mx-auto text-text-muted mb-2" size={24} />
              <p className="text-sm text-text-secondary">
                {isDragActive
                  ? t('submit.form.dropzoneActive')
                  : t('submit.form.dropzoneDefault')}
              </p>
            </div>

            {files.length > 0 && (
              <div className="space-y-2 mt-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${index}`}
                    className="flex items-center justify-between bg-bg-elevated rounded-lg px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="text-text-muted flex-shrink-0" size={16} />
                      <span className="text-sm text-text truncate">{file.name}</span>
                      <span className="text-xs text-text-muted flex-shrink-0">
                        {formatFileSize(file.size)}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="text-text-muted hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            <Button type="submit" loading={isSubmitting} className="flex-1">
              <Upload size={16} />
              {t('submit.form.submitButton')}
            </Button>
            {draftSaved && (
              <span className="text-xs text-text-muted whitespace-nowrap">{t('submit.form.draftSaved')}</span>
            )}
          </div>
        </form>
      </Card>

      {/* My submissions */}
      <div>
        <h2 className="text-lg font-semibold font-display mb-4">{t('submit.mySubmissions.title')}</h2>

        {loadingSubmissions ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="animate-spin text-text-muted" size={24} />
          </div>
        ) : mySubmissions.length > 0 ? (
          <div className="space-y-3">
            {mySubmissions.map((sub) => {
              const statusInfo = statusIcons[sub.status] ?? statusIcons.pending
              const StatusIcon = statusInfo.icon
              const statusLabel = t(`submit.status.${sub.status}` as const)
              return (
                <Card key={sub.id} padding="sm">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-medium text-text truncate">
                        {sub.title}
                      </h3>
                      <p className="text-xs text-text-muted mt-0.5">
                        {format(new Date(sub.created_at), 'd MMM yyyy', {
                          locale: dateLocale,
                        })}
                      </p>
                    </div>
                    <div className={`flex items-center gap-1.5 flex-shrink-0 ${statusInfo.color}`}>
                      <StatusIcon size={14} />
                      <span className="text-xs font-medium">{statusLabel}</span>
                    </div>
                  </div>
                  {sub.review_notes && sub.status === 'rejected' && (
                    <p className="text-xs text-red-400/80 mt-2 pt-2 border-t border-border">
                      {t('submit.mySubmissions.rejectionReason', { reason: sub.review_notes })}
                    </p>
                  )}
                </Card>
              )
            })}
          </div>
        ) : (
          <Card>
            <p className="text-text-secondary text-sm text-center py-6">
              {t('submit.mySubmissions.empty')}
            </p>
          </Card>
        )}
      </div>
    </div>
  )
}
