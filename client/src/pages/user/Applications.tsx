import { useState, useEffect, type FormEvent } from 'react'
import {
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  Plus,
  ShieldCheck,
  Sparkles,
  AlertCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import api from '@/services/api'
import { useAuthStore } from '@/stores/authStore'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input, { Textarea } from '@/components/ui/Input'
import { SkeletonCard } from '@/components/ui/Skeleton'
import {
  SETTLEMENT_DOMAINS,
  getDomainLabel,
  safeExternalUrl,
  extractApiError,
  type ApplicationStatus,
  type MemberApplication,
  type MembershipInfo,
  type MembershipStatus,
  type MyApplicationResponse,
  type PortfolioItem,
} from '@/types/core'

const MEMBERSHIP_META: Record<
  MembershipStatus,
  { label: string; variant: 'default' | 'warning' | 'success' | 'danger'; description: string }
> = {
  observer: {
    label: 'Наблюдатель (observer)',
    variant: 'default',
    description: 'Вы можете изучать материалы, голосовать как вкладчик и подать бесплатную заявку участника.',
  },
  applicant: {
    label: 'Кандидат (applicant)',
    variant: 'warning',
    description: 'Ваша заявка и портфолио находятся на рассмотрении совета сообщества.',
  },
  accepted: {
    label: 'Принятый участник (accepted)',
    variant: 'success',
    description: 'Членство подтверждено без оплаты. У вас есть право голоса в палате участников (1 чел. = 1 голос).',
  },
  suspended: {
    label: 'Приостановлен (suspended)',
    variant: 'danger',
    description: 'Участие в голосованиях временно ограничено.',
  },
}

const APPLICATION_STATUS_META: Record<
  ApplicationStatus,
  { label: string; variant: 'default' | 'info' | 'success' | 'warning' | 'danger' }
> = {
  pending: { label: 'На рассмотрении', variant: 'warning' },
  in_review: { label: 'В проверке', variant: 'info' },
  accepted: { label: 'Одобрена', variant: 'success' },
  revision_requested: { label: 'Нужна доработка', variant: 'warning' },
  rejected: { label: 'Отклонена', variant: 'danger' },
}

export default function Applications() {
  const authUser = useAuthStore((s) => s.user)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [application, setApplication] = useState<MemberApplication | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [membership, setMembership] = useState<MembershipInfo | null>(null)

  // Initial application form state
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [primaryDomain, setPrimaryDomain] = useState('GEN')
  const [skills, setSkills] = useState('')
  const [motivation, setMotivation] = useState('')
  const [trialTaskTitle, setTrialTaskTitle] = useState('')
  const [trialTaskUrl, setTrialTaskUrl] = useState('')
  const [initialPortfolioTitle, setInitialPortfolioTitle] = useState('')
  const [initialPortfolioDomain, setInitialPortfolioDomain] = useState('GEN')
  const [initialPortfolioSummary, setInitialPortfolioSummary] = useState('')
  const [initialPortfolioUrl, setInitialPortfolioUrl] = useState('')
  const [submittingApp, setSubmittingApp] = useState(false)

  // Add portfolio item form state (when application already exists)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemDomain, setNewItemDomain] = useState('GEN')
  const [newItemSummary, setNewItemSummary] = useState('')
  const [newItemUrl, setNewItemUrl] = useState('')
  const [submittingPortfolio, setSubmittingPortfolio] = useState(false)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const res = await api.get<MyApplicationResponse>('/applications/my')
        if (cancelled) return
        setApplication(res.data.application ?? null)
        setPortfolio(res.data.portfolio ?? [])
        setMembership(res.data.membership ?? null)
        if (res.data.application?.primary_domain) {
          setNewItemDomain(res.data.application.primary_domain)
        }
        setFullName((prev) => prev || res.data.membership?.name || authUser?.name || '')
        setEmail((prev) => prev || res.data.membership?.email || authUser?.email || '')
      } catch (err: unknown) {
        if (!cancelled) {
          setError(extractApiError(err, 'Не удалось загрузить данные заявки'))
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [authUser?.email, authUser?.name])

  const membershipStatus: MembershipStatus = membership?.membership_status ?? 'observer'
  const membershipMeta = MEMBERSHIP_META[membershipStatus] ?? MEMBERSHIP_META.observer

  const handleSubmitApplication = async (e: FormEvent) => {
    e.preventDefault()
    if (fullName.trim().length < 2 || !email.includes('@')) {
      toast.error('Укажите имя (от 2 символов) и корректный email')
      return
    }

    setSubmittingApp(true)
    try {
      const portfolioPayload =
        initialPortfolioTitle.trim().length >= 2
          ? [
              {
                title: initialPortfolioTitle.trim(),
                domain_code: initialPortfolioDomain || primaryDomain,
                summary: initialPortfolioSummary.trim(),
                artifact_url: initialPortfolioUrl.trim(),
              },
            ]
          : []

      const res = await api.post<{
        success: boolean
        application: MemberApplication
        portfolio: PortfolioItem[]
        message?: string
      }>('/applications', {
        full_name: fullName.trim(),
        email: email.trim(),
        city: city.trim(),
        primary_domain: primaryDomain,
        skills: skills.trim(),
        motivation: motivation.trim(),
        trial_task_title: trialTaskTitle.trim(),
        trial_task_url: trialTaskUrl.trim(),
        portfolio: portfolioPayload,
      })

      setApplication(res.data.application)
      setPortfolio(res.data.portfolio ?? [])
      setNewItemDomain(res.data.application.primary_domain || 'GEN')
      setMembership((prev) =>
        prev
          ? {
              ...prev,
              membership_status:
                prev.membership_status === 'observer' ? 'applicant' : prev.membership_status,
            }
          : null,
      )
      toast.success(res.data.message || 'Заявка отправлена')
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось отправить заявку'))
    } finally {
      setSubmittingApp(false)
    }
  }

  const handleAddPortfolioItem = async (e: FormEvent) => {
    e.preventDefault()
    if (newItemTitle.trim().length < 2) {
      toast.error('Укажите название работы в портфолио (от 2 символов)')
      return
    }

    setSubmittingPortfolio(true)
    try {
      const res = await api.post<{ success: boolean; item: PortfolioItem }>(
        '/applications/my/portfolio',
        {
          title: newItemTitle.trim(),
          domain_code: newItemDomain,
          summary: newItemSummary.trim(),
          artifact_url: newItemUrl.trim(),
        },
      )
      setPortfolio((prev) => [res.data.item, ...prev])
      setNewItemTitle('')
      setNewItemSummary('')
      setNewItemUrl('')
      toast.success('Работа добавлена в портфолио')
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось добавить работу в портфолио'))
    } finally {
      setSubmittingPortfolio(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-4xl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">Заявка и портфолио</h1>
        <p className="text-text-secondary text-sm">
          Профессиональный профиль, тестовое задание и подтверждённый вклад в развитие поселения.
        </p>
      </div>

      {error && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-3 text-red-400 text-sm">
            <AlertCircle size={18} />
            <span>{error}</span>
          </div>
        </Card>
      )}

      {/* Membership Status Banner */}
      <Card variant="highlighted">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <ShieldCheck size={18} className="text-accent" />
              <span className="text-sm font-semibold text-text">Статус членства:</span>
              <Badge variant={membershipMeta.variant} dot pulse={membershipStatus === 'applicant'}>
                {membershipMeta.label}
              </Badge>
            </div>
            <p className="text-sm text-text-secondary">{membershipMeta.description}</p>
            <p className="text-xs text-green font-medium">
              Членство в Слободе бесплатно и не требует оплаты — приём осуществляется по заявке и вкладу.
            </p>
          </div>
          {membership?.membership_admitted_at && (
            <div className="text-xs text-text-muted shrink-0">
              Принят:{' '}
              {new Date(membership.membership_admitted_at).toLocaleDateString('ru-RU')}
            </div>
          )}
        </div>
      </Card>

      {/* Either New Application Form OR Existing Application + Portfolio */}
      {!application ? (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Briefcase size={18} className="text-accent" />
            <h2 className="text-lg font-semibold font-display">Подача заявки специалиста</h2>
          </div>

          <form onSubmit={handleSubmitApplication} className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="ФИО *"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Иван Петров"
                required
              />
              <Input
                label="Email *"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Город / регион"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Москва, Казань..."
              />
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="primary-domain"
                  className="text-sm font-medium text-text-secondary"
                >
                  Основной инженерный домен
                </label>
                <select
                  id="primary-domain"
                  value={primaryDomain}
                  onChange={(e) => {
                    setPrimaryDomain(e.target.value)
                    setInitialPortfolioDomain(e.target.value)
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text focus:outline-none focus:border-accent transition-colors"
                >
                  {SETTLEMENT_DOMAINS.map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} — {d.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <Textarea
              label="Навыки и компетенции"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
              placeholder="Опишите практический опыт, образование, инструменты и проекты..."
              rows={3}
            />

            <Textarea
              label="Мотивация участия"
              value={motivation}
              onChange={(e) => setMotivation(e.target.value)}
              placeholder="Почему хотите присоединиться к Слободе и какую задачу готовы взять на себя?"
              rows={3}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Название тестового задания"
                value={trialTaskTitle}
                onChange={(e) => setTrialTaskTitle(e.target.value)}
                placeholder="Например: Расчёт теплопотерь модуля"
              />
              <Input
                label="Ссылка на тестовое задание"
                type="url"
                value={trialTaskUrl}
                onChange={(e) => setTrialTaskUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            {/* Initial Portfolio Item */}
            <div className="pt-4 border-t border-border space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-accent" />
                <h3 className="text-sm font-semibold text-text">
                  Первая работа в портфолио (опционально)
                </h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Название проекта / кейса"
                  value={initialPortfolioTitle}
                  onChange={(e) => setInitialPortfolioTitle(e.target.value)}
                  placeholder="Например: Автономная СЭС 15 кВт"
                />
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="init-portfolio-domain"
                    className="text-sm font-medium text-text-secondary"
                  >
                    Домен работы
                  </label>
                  <select
                    id="init-portfolio-domain"
                    value={initialPortfolioDomain}
                    onChange={(e) => setInitialPortfolioDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text focus:outline-none focus:border-accent transition-colors"
                  >
                    {SETTLEMENT_DOMAINS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Textarea
                label="Описание результата"
                value={initialPortfolioSummary}
                onChange={(e) => setInitialPortfolioSummary(e.target.value)}
                placeholder="Кратко: задача, решение, измеримый результат"
                rows={2}
              />

              <Input
                label="Ссылка на артефакт (репозиторий, чертежи, фото)"
                type="url"
                value={initialPortfolioUrl}
                onChange={(e) => setInitialPortfolioUrl(e.target.value)}
                placeholder="https://..."
              />
            </div>

            <div className="flex justify-end">
              <Button type="submit" loading={submittingApp}>
                Отправить заявку
              </Button>
            </div>
          </form>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Application Status Card */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <FileCheck2 size={18} className="text-accent" />
                  <h2 className="text-lg font-semibold font-display">
                    Заявка #{application.id}
                  </h2>
                  <Badge
                    variant={
                      (APPLICATION_STATUS_META[application.status] ?? { variant: 'default' })
                        .variant
                    }
                    dot
                  >
                    {(APPLICATION_STATUS_META[application.status] ?? { label: application.status })
                      .label}
                  </Badge>
                </div>
                <p className="text-xs text-text-muted mt-1">
                  Подана {new Date(application.created_at).toLocaleDateString('ru-RU')} ·
                  Домен: {getDomainLabel(application.primary_domain)}
                </p>
              </div>
              <div className="text-xs text-text-muted">Версия #{application.version}</div>
            </div>

            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <dt className="text-text-muted text-xs">Имя</dt>
                <dd className="text-text font-medium mt-0.5">{application.full_name}</dd>
              </div>
              <div>
                <dt className="text-text-muted text-xs">Email</dt>
                <dd className="text-text font-medium mt-0.5">{application.email}</dd>
              </div>
              {application.city && (
                <div>
                  <dt className="text-text-muted text-xs">Город</dt>
                  <dd className="text-text mt-0.5">{application.city}</dd>
                </div>
              )}
              {application.trial_task_title && (
                <div>
                  <dt className="text-text-muted text-xs">Тестовое задание</dt>
                  <dd className="text-text mt-0.5 flex items-center gap-2">
                    <span>{application.trial_task_title}</span>
                    {safeExternalUrl(application.trial_task_url) && (
                      <a
                        href={safeExternalUrl(application.trial_task_url) ?? undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-accent hover:underline text-xs"
                      >
                        Открыть <ExternalLink size={12} />
                      </a>
                    )}
                  </dd>
                </div>
              )}
            </dl>

            {application.skills && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-text-muted mb-1">Навыки</p>
                <p className="text-sm text-text-secondary whitespace-pre-line">
                  {application.skills}
                </p>
              </div>
            )}

            {application.motivation && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-xs text-text-muted mb-1">Мотивация</p>
                <p className="text-sm text-text-secondary whitespace-pre-line">
                  {application.motivation}
                </p>
              </div>
            )}

            {application.review_note && (
              <div className="mt-4 p-3 rounded-lg bg-bg-elevated border border-border">
                <p className="text-xs font-medium text-text-muted mb-1">
                  Комментарий рецензента
                  {application.reviewed_at
                    ? ` (${new Date(application.reviewed_at).toLocaleDateString('ru-RU')})`
                    : ''}
                  :
                </p>
                <p className="text-sm text-text">{application.review_note}</p>
              </div>
            )}
          </Card>

          {/* Portfolio List */}
          <Card>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold font-display">
                Портфолио ({portfolio.length})
              </h2>
            </div>

            {portfolio.length === 0 ? (
              <p className="text-sm text-text-muted">
                В портфолио пока нет работ. Добавьте кейс или выполненное задание ниже.
              </p>
            ) : (
              <div className="space-y-3">
                {portfolio.map((item) => {
                  const link = safeExternalUrl(item.artifact_url)
                  return (
                    <div
                      key={item.id}
                      className="p-4 rounded-lg bg-bg-elevated/60 border border-border space-y-2"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="text-sm font-semibold text-text">{item.title}</h3>
                            <Badge variant="info">{item.domain_code}</Badge>
                            {item.verified ? (
                              <Badge variant="success">
                                <CheckCircle2 size={12} /> Проверено
                              </Badge>
                            ) : (
                              <Badge variant="default">
                                <Clock size={12} /> Ожидает проверки
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-text-muted">
                            {getDomainLabel(item.domain_code)} ·{' '}
                            {new Date(item.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                        {link && (
                          <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                          >
                            Артефакт <ExternalLink size={12} />
                          </a>
                        )}
                      </div>
                      {item.summary && (
                        <p className="text-sm text-text-secondary whitespace-pre-line">
                          {item.summary}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {/* Add Portfolio Item Form */}
            <form
              onSubmit={handleAddPortfolioItem}
              className="mt-6 pt-6 border-t border-border space-y-4"
            >
              <div className="flex items-center gap-2">
                <Plus size={16} className="text-accent" />
                <h3 className="text-sm font-semibold text-text">Добавить работу в портфолио</h3>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input
                  label="Название *"
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  placeholder="Название проекта или задачи"
                  required
                />
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="new-portfolio-domain"
                    className="text-sm font-medium text-text-secondary"
                  >
                    Домен
                  </label>
                  <select
                    id="new-portfolio-domain"
                    value={newItemDomain}
                    onChange={(e) => setNewItemDomain(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text focus:outline-none focus:border-accent transition-colors"
                  >
                    {SETTLEMENT_DOMAINS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <Textarea
                label="Описание"
                value={newItemSummary}
                onChange={(e) => setNewItemSummary(e.target.value)}
                placeholder="Что сделано, какие технологии/материалы применены, итог"
                rows={2}
              />

              <Input
                label="Ссылка на результат"
                type="url"
                value={newItemUrl}
                onChange={(e) => setNewItemUrl(e.target.value)}
                placeholder="https://..."
              />

              <div className="flex justify-end">
                <Button type="submit" loading={submittingPortfolio} size="sm">
                  Добавить в портфолио
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  )
}
