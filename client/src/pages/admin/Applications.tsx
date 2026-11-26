import { useCallback, useEffect, useState } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import {
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  Loader2,
  RotateCcw,
  UserCheck,
  XCircle,
} from 'lucide-react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import { Textarea } from '@/components/ui/Input'
import {
  extractApiError,
  getDomainLabel,
  safeExternalUrl,
  type AdminApplicationItem,
  type ApplicationStatus,
} from '@/types/core'

type StatusFilter = 'all' | ApplicationStatus

const FILTER_TABS: readonly { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'pending', label: 'На рассмотрении' },
  { value: 'in_review', label: 'В проверке' },
  { value: 'revision_requested', label: 'На доработке' },
  { value: 'accepted', label: 'Принятые' },
  { value: 'rejected', label: 'Отклонённые' },
]

const STATUS_META: Record<
  ApplicationStatus,
  { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  pending: { label: 'На рассмотрении', variant: 'warning' },
  in_review: { label: 'В проверке', variant: 'info' },
  revision_requested: { label: 'Нужна доработка', variant: 'warning' },
  accepted: { label: 'Принята', variant: 'success' },
  rejected: { label: 'Отклонена', variant: 'danger' },
}

const NON_TERMINAL_STATUSES = new Set<ApplicationStatus>([
  'pending',
  'in_review',
  'revision_requested',
])

export default function AdminApplications() {
  const [applications, setApplications] = useState<AdminApplicationItem[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [loading, setLoading] = useState(true)
  const [reviewNotes, setReviewNotes] = useState<Record<number, string>>({})
  const [submittingId, setSubmittingId] = useState<number | null>(null)

  const fetchApplications = useCallback(async () => {
    setLoading(true)
    try {
      const params = statusFilter === 'all' ? undefined : { status: statusFilter }
      const res = await adminApi.get<{
        success: boolean
        applications: AdminApplicationItem[]
      }>('/admin/applications', { params })
      const list = res.data.applications ?? []
      setApplications(list)
      setReviewNotes((prev) => {
        const next = { ...prev }
        for (const app of list) {
          if (next[app.id] === undefined) {
            next[app.id] = app.review_note ?? ''
          }
        }
        return next
      })
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось загрузить заявки на членство'))
    } finally {
      setLoading(false)
    }
  }, [statusFilter])

  useEffect(() => {
    fetchApplications()
  }, [fetchApplications])

  const handleReview = async (
    app: AdminApplicationItem,
    nextStatus: 'in_review' | 'revision_requested' | 'accepted' | 'rejected',
  ) => {
    const note = (reviewNotes[app.id] ?? '').trim()
    if (nextStatus === 'revision_requested' && !note) {
      toast.error('Укажите комментарий рецензента при запросе доработки')
      return
    }

    setSubmittingId(app.id)
    try {
      await adminApi.post(`/admin/applications/${app.id}/review`, {
        status: nextStatus,
        review_note: note,
        expected_version: app.version,
      })
      const label = STATUS_META[nextStatus]?.label ?? nextStatus
      toast.success(`Заявка #${app.id}: ${label}`)
      await fetchApplications()
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast.warning(
          extractApiError(
            err,
            'Версия заявки устарела (409 Conflict). Список обновлён — проверьте актуальный статус.',
          ),
        )
        await fetchApplications()
      } else {
        toast.error(extractApiError(err, 'Не удалось обновить статус заявки'))
      }
    } finally {
      setSubmittingId(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display mb-1">Заявки на членство</h1>
          <p className="text-sm text-text-secondary">
            Рассмотрение анкет специалистов, тестовых заданий и портфолио (приём без оплаты).
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={fetchApplications} disabled={loading}>
          Обновить
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setStatusFilter(tab.value)}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              statusFilter === tab.value
                ? 'bg-accent/15 text-accent border border-accent/30'
                : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={28} className="animate-spin text-accent" />
        </div>
      ) : applications.length === 0 ? (
        <Card>
          <div className="text-center py-10 space-y-2">
            <Briefcase size={32} className="mx-auto text-text-muted" />
            <p className="text-sm text-text-secondary">Заявок с выбранным статусом нет.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => {
            const meta = STATUS_META[app.status] ?? {
              label: app.status,
              variant: 'default' as const,
            }
            const isNonTerminal = NON_TERMINAL_STATUSES.has(app.status)
            const canAccept = app.status === 'pending' || app.status === 'in_review'
            const trialHref = safeExternalUrl(app.trial_task_url)
            const portfolioItems = app.portfolio ?? []
            const isBusy = submittingId === app.id

            return (
              <Card key={app.id} className="space-y-4">
                {/* Top header */}
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileCheck2 size={18} className="text-accent" />
                      <h2 className="text-lg font-semibold font-display text-text">
                        #{app.id} · {app.full_name}
                      </h2>
                      <Badge
                        variant={meta.variant}
                        dot
                        pulse={app.status === 'pending' || app.status === 'in_review'}
                      >
                        {meta.label}
                      </Badge>
                      <Badge variant="default">v{app.version}</Badge>
                      {!app.user_id && (
                        <Badge variant="warning">Гостевая (не привязана к аккаунту)</Badge>
                      )}
                    </div>
                    <p className="text-xs text-text-muted">
                      {app.email}
                      {app.city ? ` · ${app.city}` : ''} · Домен:{' '}
                      {getDomainLabel(app.primary_domain)} · Подана{' '}
                      {new Date(app.created_at).toLocaleString('ru-RU')}
                    </p>
                  </div>
                </div>

                {/* Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  {app.skills && (
                    <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
                      <p className="text-xs font-medium text-text-muted mb-1">Навыки</p>
                      <p className="text-text-secondary whitespace-pre-line">{app.skills}</p>
                    </div>
                  )}
                  {app.motivation && (
                    <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border">
                      <p className="text-xs font-medium text-text-muted mb-1">Мотивация</p>
                      <p className="text-text-secondary whitespace-pre-line">{app.motivation}</p>
                    </div>
                  )}
                </div>

                {(app.trial_task_title || trialHref) && (
                  <div className="p-3 rounded-lg bg-bg-elevated/50 border border-border text-sm flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="text-xs text-text-muted mr-2">Тестовое задание:</span>
                      <span className="text-text font-medium">
                        {app.trial_task_title || 'Ссылка на задание'}
                      </span>
                    </div>
                    {trialHref && (
                      <a
                        href={trialHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        Открыть решение <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                )}

                {/* Portfolio items */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-secondary">
                    Портфолио ({portfolioItems.length})
                  </p>
                  {portfolioItems.length === 0 ? (
                    <p className="text-xs text-text-muted">Портфолио не приложено.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {portfolioItems.map((item) => {
                        const itemHref = safeExternalUrl(item.artifact_url)
                        return (
                          <div
                            key={item.id}
                            className="p-3 rounded-lg bg-bg-elevated/60 border border-border space-y-1.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-sm font-medium text-text">{item.title}</span>
                                <Badge variant="info">{item.domain_code}</Badge>
                                {item.verified ? (
                                  <Badge variant="success">
                                    <CheckCircle2 size={11} /> Проверено
                                  </Badge>
                                ) : (
                                  <Badge variant="default">
                                    <Clock size={11} /> Не проверено
                                  </Badge>
                                )}
                              </div>
                              {itemHref && (
                                <a
                                  href={itemHref}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                                >
                                  Ссылка <ExternalLink size={11} />
                                </a>
                              )}
                            </div>
                            {item.summary && (
                              <p className="text-xs text-text-secondary whitespace-pre-line">
                                {item.summary}
                              </p>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Existing review note on terminal applications */}
                {!isNonTerminal && app.review_note && (
                  <div className="p-3 rounded-lg bg-bg-elevated border border-border text-sm">
                    <p className="text-xs font-medium text-text-muted mb-1">
                      Комментарий рецензента
                      {app.reviewed_at
                        ? ` (${new Date(app.reviewed_at).toLocaleString('ru-RU')})`
                        : ''}
                      :
                    </p>
                    <p className="text-text">{app.review_note}</p>
                  </div>
                )}

                {/* Review action panel for non-terminal applications */}
                {isNonTerminal && (
                  <div className="pt-4 border-t border-border space-y-3">
                    <Textarea
                      label="Комментарий рецензента (обязателен для запроса доработки)"
                      value={reviewNotes[app.id] ?? ''}
                      onChange={(e) =>
                        setReviewNotes((prev) => ({ ...prev, [app.id]: e.target.value }))
                      }
                      placeholder="Укажите замечания для доработки или причину решения..."
                      rows={2}
                      disabled={isBusy}
                    />

                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isBusy || app.status === 'in_review'}
                        loading={isBusy}
                        onClick={() => handleReview(app, 'in_review')}
                      >
                        <Clock size={14} />
                        Взять на рассмотрение
                      </Button>

                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleReview(app, 'revision_requested')}
                      >
                        <RotateCcw size={14} />
                        Запросить доработку
                      </Button>

                      {canAccept && (
                        <Button
                          type="button"
                          variant="primary"
                          size="sm"
                          disabled={isBusy}
                          onClick={() => handleReview(app, 'accepted')}
                        >
                          <UserCheck size={14} />
                          Принять в участники (бесплатно)
                        </Button>
                      )}

                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        disabled={isBusy}
                        onClick={() => handleReview(app, 'rejected')}
                      >
                        <XCircle size={14} />
                        Отклонить
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
