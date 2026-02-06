import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { toast } from 'sonner'
import {
  Loader2,
  CheckCircle,
  XCircle,
  BookOpen,
  Tag,
  Brain,
  User,
  Calendar,
} from 'lucide-react'
import type { KnowledgeSubmission, Category } from '@/types'

type StatusTab = 'pending' | 'reviewing' | 'approved' | 'rejected'

const TABS: { value: StatusTab; label: string }[] = [
  { value: 'pending', label: 'Ожидают' },
  { value: 'reviewing', label: 'На проверке' },
  { value: 'approved', label: 'Одобрены' },
  { value: 'rejected', label: 'Отклонены' },
]

function ConfidenceBadge({ confidence }: { confidence: number | undefined }) {
  if (confidence === undefined || confidence === null) return null
  const pct = Math.round(confidence * 100)
  let color = 'bg-red-500/20 text-red-400'
  if (confidence > 0.8) color = 'bg-green-500/20 text-green-400'
  else if (confidence > 0.5) color = 'bg-yellow-500/20 text-yellow-400'
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${color}`}>
      {pct}%
    </span>
  )
}

export default function Knowledge() {
  const [submissions, setSubmissions] = useState<KnowledgeSubmission[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<StatusTab>('pending')

  // Review modal
  const [reviewItem, setReviewItem] = useState<KnowledgeSubmission | null>(null)
  const [reviewOpen, setReviewOpen] = useState(false)
  const [reviewNotes, setReviewNotes] = useState('')
  const [overrideCategory, setOverrideCategory] = useState('')
  const [actionLoading, setActionLoading] = useState(false)

  const fetchSubmissions = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.get('/admin/knowledge', { params: { status: activeTab } })
      setSubmissions(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки материалов')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchSubmissions()
  }, [fetchSubmissions])

  useEffect(() => {
    adminApi.get('/admin/categories')
      .then((res) => setCategories(res.data.data ?? []))
      .catch(() => {})
  }, [])

  const openReview = (item: KnowledgeSubmission) => {
    setReviewItem(item)
    setReviewNotes(item.review_notes ?? '')
    setOverrideCategory(item.final_category_id?.toString() ?? item.ai_category_id?.toString() ?? '')
    setReviewOpen(true)
  }

  const handleAction = async (action: 'approved' | 'rejected') => {
    if (!reviewItem) return
    setActionLoading(true)
    try {
      await adminApi.patch(`/admin/knowledge/${reviewItem.id}`, {
        status: action,
        reviewNotes: reviewNotes || undefined,
        finalCategoryId: overrideCategory ? parseInt(overrideCategory) : undefined,
      })
      toast.success(action === 'approved' ? 'Материал одобрен' : 'Материал отклонён')
      setReviewOpen(false)
      fetchSubmissions()
    } catch {
      toast.error('Ошибка обновления')
    } finally {
      setActionLoading(false)
    }
  }

  const handlePublish = async () => {
    if (!reviewItem) return
    setActionLoading(true)
    try {
      await adminApi.post(`/admin/knowledge/${reviewItem.id}/publish`)
      toast.success('Опубликовано как статья')
      setReviewOpen(false)
      fetchSubmissions()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Ошибка публикации'
      toast.error(msg)
    } finally {
      setActionLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-display mb-6">Знания</h1>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-bg-card border border-border rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${activeTab === tab.value
                ? 'bg-accent/20 text-accent'
                : 'text-text-secondary hover:text-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Cards grid */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={24} className="animate-spin text-accent" />
        </div>
      ) : submissions.length === 0 ? (
        <Card>
          <p className="text-center text-text-muted text-sm">Материалов не найдено</p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {submissions.map((item) => (
            <Card key={item.id} padding="md" className="flex flex-col gap-3">
              <div className="flex items-start justify-between">
                <h3 className="font-semibold text-sm line-clamp-2">{item.title}</h3>
                <ConfidenceBadge confidence={item.ai_confidence} />
              </div>

              <div className="flex items-center gap-3 text-xs text-text-muted">
                <span className="flex items-center gap-1">
                  <User size={12} />
                  {item.user_name ?? `User #${item.user_id}`}
                </span>
                <span className="flex items-center gap-1">
                  <Calendar size={12} />
                  {new Date(item.created_at).toLocaleDateString('ru-RU')}
                </span>
              </div>

              {/* AI classification */}
              {(item.ai_summary || item.ai_tags) && (
                <div className="bg-bg rounded-lg p-2.5 text-xs">
                  <div className="flex items-center gap-1 text-text-muted mb-1.5">
                    <Brain size={12} />
                    <span className="uppercase tracking-wider">AI-классификация</span>
                  </div>
                  {item.ai_category_name && (
                    <p className="text-text-secondary mb-1">
                      Категория: <span className="text-text">{item.ai_category_name}</span>
                    </p>
                  )}
                  {item.ai_summary && (
                    <p className="text-text-secondary mb-1 line-clamp-2">{item.ai_summary}</p>
                  )}
                  {item.ai_tags && item.ai_tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {item.ai_tags.map((tag) => (
                        <span key={tag} className="flex items-center gap-0.5 px-1.5 py-0.5 bg-bg-elevated border border-border rounded text-text-muted">
                          <Tag size={10} />
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              <Button
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => openReview(item)}
              >
                <BookOpen size={14} />
                Проверить
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Review Modal */}
      <Modal
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        title="Проверка материала"
        description={reviewItem?.title}
      >
        {reviewItem && (
          <div className="flex flex-col gap-4">
            {/* Full content */}
            <div className="bg-bg rounded-lg p-3 max-h-48 overflow-y-auto">
              <p className="text-sm text-text-secondary whitespace-pre-wrap">
                {reviewItem.description}
              </p>
              {reviewItem.body && (
                <div className="mt-2 pt-2 border-t border-border text-sm text-text-secondary"
                  dangerouslySetInnerHTML={{ __html: reviewItem.body }}
                />
              )}
            </div>

            {/* AI suggestions */}
            {reviewItem.ai_summary && (
              <div className="bg-bg rounded-lg p-3">
                <p className="text-xs text-text-muted mb-1 flex items-center gap-1">
                  <Brain size={12} /> AI-анализ
                </p>
                <p className="text-sm text-text-secondary">{reviewItem.ai_summary}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-text-muted">Уверенность:</span>
                  <ConfidenceBadge confidence={reviewItem.ai_confidence} />
                </div>
              </div>
            )}

            {/* Category override */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Категория</label>
              <select
                value={overrideCategory}
                onChange={(e) => setOverrideCategory(e.target.value)}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border
                  text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Без категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Заметки рецензента</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Комментарий..."
                rows={3}
                className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border
                  text-text text-sm placeholder:text-text-muted resize-none
                  focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button
                variant="primary"
                size="sm"
                loading={actionLoading}
                onClick={() => handleAction('approved')}
              >
                <CheckCircle size={14} />
                Одобрить
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={actionLoading}
                onClick={() => handleAction('rejected')}
              >
                <XCircle size={14} />
                Отклонить
              </Button>
              {(reviewItem.status === 'approved' && !reviewItem.published_post_id) && (
                <Button
                  variant="secondary"
                  size="sm"
                  loading={actionLoading}
                  onClick={handlePublish}
                >
                  <BookOpen size={14} />
                  Опубликовать как статью
                </Button>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
