import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import axios from 'axios'
import {
  Briefcase,
  CheckCircle2,
  Clock,
  ExternalLink,
  FileCheck2,
  KeyRound,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  AlertCircle,
  ChevronDown,
  ChevronUp,
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

interface ApplicationDraft {
  fullName: string
  email: string
  city: string
  primaryDomain: string
  skills: string
  motivation: string
  trialTaskTitle: string
  trialTaskUrl: string
  initialPortfolioTitle: string
  initialPortfolioDomain: string
  initialPortfolioSummary: string
  initialPortfolioUrl: string
}

interface RevisionDraftFields {
  revFullName: string
  revCity: string
  revPrimaryDomain: string
  revSkills: string
  revMotivation: string
  revTrialTaskTitle: string
  revTrialTaskUrl: string
}

interface RevisionDraft extends RevisionDraftFields {
  applicationId: number
  baseVersion: number
  draftRevId: string
  editorTabId: string
  updatedAt: string
}

interface StoredRevisionDraftEntry {
  key: string
  draft: RevisionDraft
}

interface RevisionConflict {
  serverVersion: number
  serverStatus: ApplicationStatus
  draftBaseVersion: number
  serverApplication: MemberApplication | null
  refreshFailed?: boolean
}

function generateClientToken(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`
    }
  } catch {
    // Fallback below
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function getDraftStorageKey(userId?: string | number | null): string {
  return `sloboda_application_draft:${userId || 'anon'}`
}

function getLegacyRevisionDraftKey(
  userId: string | number | null | undefined,
  appId: number,
): string {
  return `sloboda_revision_draft:${userId || 'anon'}:${appId}`
}

function getImmutableRevisionDraftKey(
  userId: string | number | null | undefined,
  appId: number,
  draftRevId: string,
): string {
  return `${getLegacyRevisionDraftKey(userId, appId)}:rev:${draftRevId}`
}

function isRevisionDraftKeyForApp(
  key: string,
  userId: string | number | null | undefined,
  appId: number,
): boolean {
  const base = getLegacyRevisionDraftKey(userId, appId)
  return key === base || key.startsWith(`${base}:rev:`) || key.startsWith(`${base}:tab:`)
}

function readDraft(key: string): Partial<ApplicationDraft> | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<ApplicationDraft>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function readRevisionDraft(key: string): RevisionDraft | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<RevisionDraft>
    if (!parsed || typeof parsed !== 'object') return null
    if (typeof parsed.applicationId !== 'number' || typeof parsed.baseVersion !== 'number') {
      return null
    }
    const updatedAt = typeof parsed.updatedAt === 'string' ? parsed.updatedAt : ''
    const draftRevId =
      typeof parsed.draftRevId === 'string' && parsed.draftRevId.length > 0
        ? parsed.draftRevId
        : `legacy:${parsed.applicationId}:${parsed.baseVersion}:${updatedAt || '0'}`
    const editorTabId =
      typeof parsed.editorTabId === 'string' && parsed.editorTabId.length > 0
        ? parsed.editorTabId
        : 'legacy'
    return {
      applicationId: parsed.applicationId,
      baseVersion: parsed.baseVersion,
      draftRevId,
      editorTabId,
      revFullName: typeof parsed.revFullName === 'string' ? parsed.revFullName : '',
      revCity: typeof parsed.revCity === 'string' ? parsed.revCity : '',
      revPrimaryDomain: typeof parsed.revPrimaryDomain === 'string' ? parsed.revPrimaryDomain : 'GEN',
      revSkills: typeof parsed.revSkills === 'string' ? parsed.revSkills : '',
      revMotivation: typeof parsed.revMotivation === 'string' ? parsed.revMotivation : '',
      revTrialTaskTitle: typeof parsed.revTrialTaskTitle === 'string' ? parsed.revTrialTaskTitle : '',
      revTrialTaskUrl: typeof parsed.revTrialTaskUrl === 'string' ? parsed.revTrialTaskUrl : '',
      updatedAt,
    }
  } catch {
    return null
  }
}

function readAllRevisionDrafts(
  userId: string | number | null | undefined,
  appId: number,
): StoredRevisionDraftEntry[] {
  const entries: StoredRevisionDraftEntry[] = []
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i)
      if (!key || !isRevisionDraftKeyForApp(key, userId, appId)) continue
      const draft = readRevisionDraft(key)
      if (draft && draft.applicationId === appId) {
        entries.push({ key, draft })
      }
    }
  } catch {
    // Ignore storage errors
  }
  entries.sort((a, b) => {
    const timeCmp = (b.draft.updatedAt || '').localeCompare(a.draft.updatedAt || '')
    if (timeCmp !== 0) return timeCmp
    return b.key.localeCompare(a.key)
  })
  return entries
}

function writeRevisionDraft(key: string, draft: RevisionDraft): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(draft))
    return true
  } catch {
    return false
  }
}

/**
 * Atomic removal for immutable `:rev:<draftRevId>` keys: since each revision key is uniquely
 * named by its immutable `draftRevId` and never overwritten by another tab, `removeItem(key)`
 * cannot race with or delete a newer revision. For legacy/mutable keys, checks `draftRevId` first.
 */
function removeExactRevisionDraft(key: string, expectedDraftRevId: string): boolean {
  try {
    if (key.includes(':rev:')) {
      if (!key.endsWith(`:rev:${expectedDraftRevId}`)) {
        return false
      }
      localStorage.removeItem(key)
      return true
    }
    const current = readRevisionDraft(key)
    if (!current || current.draftRevId !== expectedDraftRevId) {
      return false
    }
    localStorage.removeItem(key)
    return true
  } catch {
    return false
  }
}

export default function Applications() {
  const authUser = useAuthStore((s) => s.user)
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [application, setApplication] = useState<MemberApplication | null>(null)
  const [portfolio, setPortfolio] = useState<PortfolioItem[]>([])
  const [membership, setMembership] = useState<MembershipInfo | null>(null)
  const [draftReady, setDraftReady] = useState(false)
  const [revisionConflict, setRevisionConflict] = useState<RevisionConflict | null>(null)
  const [revisionDraftVisible, setRevisionDraftVisible] = useState(false)
  const [retryingConflict, setRetryingConflict] = useState(false)
  const [recoverableDrafts, setRecoverableDrafts] = useState<StoredRevisionDraftEntry[]>([])

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

  // Revision form state (when application.status === 'revision_requested')
  const [revFullName, setRevFullName] = useState('')
  const [revCity, setRevCity] = useState('')
  const [revPrimaryDomain, setRevPrimaryDomain] = useState('GEN')
  const [revSkills, setRevSkills] = useState('')
  const [revMotivation, setRevMotivation] = useState('')
  const [revTrialTaskTitle, setRevTrialTaskTitle] = useState('')
  const [revTrialTaskUrl, setRevTrialTaskUrl] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)

  // Claim guest application by token
  const urlClaimToken = searchParams.get('claim_token')?.trim() || ''
  const [claimExpanded, setClaimExpanded] = useState(Boolean(urlClaimToken))
  const [claimTokenInput, setClaimTokenInput] = useState(urlClaimToken)
  const [claiming, setClaiming] = useState(false)
  const [claimFeedback, setClaimFeedback] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  // Add portfolio item form state (when application already exists)
  const [newItemTitle, setNewItemTitle] = useState('')
  const [newItemDomain, setNewItemDomain] = useState('GEN')
  const [newItemSummary, setNewItemSummary] = useState('')
  const [newItemUrl, setNewItemUrl] = useState('')
  const [submittingPortfolio, setSubmittingPortfolio] = useState(false)

  const revisionFieldsRef = useRef<RevisionDraftFields>({
    revFullName: '',
    revCity: '',
    revPrimaryDomain: 'GEN',
    revSkills: '',
    revMotivation: '',
    revTrialTaskTitle: '',
    revTrialTaskUrl: '',
  })
  const revisionEditSeqRef = useRef(0)
  const tabIdRef = useRef<string>(generateClientToken('tab'))
  const activeDraftKeyRef = useRef<string | null>(null)
  const lastDraftRevIdRef = useRef<string | null>(null)
  const ownDraftKeyRef = useRef<string | null>(null)
  const ownDraftRevIdRef = useRef<string | null>(null)
  const activeAppIdRef = useRef<number | null>(null)
  const latestAppVersionRef = useRef<number>(0)
  const requestGenRef = useRef(0)

  const applyRevisionFieldsState = useCallback((fields: RevisionDraftFields) => {
    revisionFieldsRef.current = fields
    setRevFullName(fields.revFullName)
    setRevCity(fields.revCity)
    setRevPrimaryDomain(fields.revPrimaryDomain || 'GEN')
    setRevSkills(fields.revSkills)
    setRevMotivation(fields.revMotivation)
    setRevTrialTaskTitle(fields.revTrialTaskTitle)
    setRevTrialTaskUrl(fields.revTrialTaskUrl)
  }, [])

  const applyApplicationMonotonic = useCallback((nextApp: MemberApplication | null): boolean => {
    if (!nextApp) {
      activeAppIdRef.current = null
      latestAppVersionRef.current = 0
      setApplication(null)
      return true
    }
    if (activeAppIdRef.current === nextApp.id && nextApp.version < latestAppVersionRef.current) {
      return false
    }
    activeAppIdRef.current = nextApp.id
    latestAppVersionRef.current = nextApp.version
    setApplication((prev) => {
      if (prev && prev.id === nextApp.id && nextApp.version < prev.version) {
        return prev
      }
      return nextApp
    })
    return true
  }, [])

  const syncRevisionFields = useCallback(
    (app: MemberApplication | null) => {
      if (!app) return
      applyRevisionFieldsState({
        revFullName: app.full_name || '',
        revCity: app.city || '',
        revPrimaryDomain: app.primary_domain || 'GEN',
        revSkills: app.skills || '',
        revMotivation: app.motivation || '',
        revTrialTaskTitle: app.trial_task_title || '',
        revTrialTaskUrl: app.trial_task_url || '',
      })
    },
    [applyRevisionFieldsState],
  )

  const effectiveUserId = membership?.id ?? authUser?.id ?? application?.user_id

  const updateRevisionField = useCallback(
    <K extends keyof RevisionDraftFields>(field: K, value: RevisionDraftFields[K]) => {
      revisionEditSeqRef.current += 1
      const nextFields: RevisionDraftFields = {
        ...revisionFieldsRef.current,
        [field]: value,
      }
      revisionFieldsRef.current = nextFields

      if (field === 'revFullName') setRevFullName(value)
      else if (field === 'revCity') setRevCity(value)
      else if (field === 'revPrimaryDomain') setRevPrimaryDomain(value)
      else if (field === 'revSkills') setRevSkills(value)
      else if (field === 'revMotivation') setRevMotivation(value)
      else if (field === 'revTrialTaskTitle') setRevTrialTaskTitle(value)
      else if (field === 'revTrialTaskUrl') setRevTrialTaskUrl(value)

      if (application && application.status === 'revision_requested') {
        const legacyKey = getLegacyRevisionDraftKey(effectiveUserId, application.id)
        const nextRevId = generateClientToken(`rev-${revisionEditSeqRef.current}`)
        const nextKey = getImmutableRevisionDraftKey(effectiveUserId, application.id, nextRevId)
        const prevOwnKey = ownDraftKeyRef.current
        const prevOwnRevId = ownDraftRevIdRef.current
        const prevActiveKey = activeDraftKeyRef.current
        const prevActiveRevId = lastDraftRevIdRef.current
        const existingBefore = readAllRevisionDrafts(effectiveUserId, application.id)

        const wrote = writeRevisionDraft(nextKey, {
          applicationId: application.id,
          baseVersion: revisionConflict?.draftBaseVersion ?? application.version,
          draftRevId: nextRevId,
          editorTabId: tabIdRef.current,
          ...nextFields,
          updatedAt: new Date().toISOString(),
        })
        if (wrote) {
          // Atomically retire only this tab's own previous immutable revision key.
          // If this tab recovered the sole draft after reload (or a legacy un-tabbed key),
          // retire that exact revision key too; NEVER delete another tab's key when 2+ drafts exist.
          if (prevOwnKey && prevOwnRevId && prevOwnKey !== nextKey) {
            removeExactRevisionDraft(prevOwnKey, prevOwnRevId)
          } else if (
            prevActiveKey &&
            prevActiveRevId &&
            prevActiveKey !== nextKey &&
            (prevActiveKey === legacyKey || existingBefore.length === 1)
          ) {
            removeExactRevisionDraft(prevActiveKey, prevActiveRevId)
          }
          ownDraftKeyRef.current = nextKey
          ownDraftRevIdRef.current = nextRevId
          activeDraftKeyRef.current = nextKey
          lastDraftRevIdRef.current = nextRevId
        }
        setRecoverableDrafts(readAllRevisionDrafts(effectiveUserId, application.id))
        setRevisionDraftVisible(true)
      }
    },
    [application, effectiveUserId, revisionConflict?.draftBaseVersion],
  )

  const loadMyApplication = useCallback(async () => {
    const gen = ++requestGenRef.current
    const editSeqAtStart = revisionEditSeqRef.current
    setLoadFailed(false)
    try {
      const res = await api.get<MyApplicationResponse>('/applications/my')
      if (gen !== requestGenRef.current) return
      const app = res.data.application ?? null
      if (!applyApplicationMonotonic(app)) return
      setPortfolio(res.data.portfolio ?? [])
      setMembership(res.data.membership ?? null)
      setError(null)
      setLoadFailed(false)

      if (app) {
        const resolvedUserId = res.data.membership?.id ?? authUser?.id ?? app.user_id
        const allDrafts = readAllRevisionDrafts(resolvedUserId, app.id)
        setRecoverableDrafts(allDrafts)
        const primaryEntry = allDrafts[0] ?? null

        if (primaryEntry) {
          const savedRevDraft = primaryEntry.draft
          if (revisionEditSeqRef.current === editSeqAtStart) {
            applyRevisionFieldsState({
              revFullName: savedRevDraft.revFullName,
              revCity: savedRevDraft.revCity,
              revPrimaryDomain: savedRevDraft.revPrimaryDomain || 'GEN',
              revSkills: savedRevDraft.revSkills,
              revMotivation: savedRevDraft.revMotivation,
              revTrialTaskTitle: savedRevDraft.revTrialTaskTitle,
              revTrialTaskUrl: savedRevDraft.revTrialTaskUrl,
            })
            activeDraftKeyRef.current = primaryEntry.key
            lastDraftRevIdRef.current = savedRevDraft.draftRevId
          }
          setRevisionDraftVisible(true)

          const hasDivergentOrStaleDraft =
            allDrafts.length > 1 ||
            savedRevDraft.baseVersion !== app.version ||
            app.status !== 'revision_requested'

          if (hasDivergentOrStaleDraft) {
            setRevisionConflict({
              serverVersion: app.version,
              serverStatus: app.status,
              draftBaseVersion: savedRevDraft.baseVersion,
              serverApplication: app,
            })
          } else {
            setRevisionConflict(null)
          }
        } else if (revisionEditSeqRef.current === editSeqAtStart) {
          activeDraftKeyRef.current = null
          lastDraftRevIdRef.current = null
          syncRevisionFields(app)
          setRevisionConflict(null)
          setRevisionDraftVisible(false)
        }

        if (app.primary_domain) {
          setNewItemDomain(app.primary_domain)
        }
      } else {
        activeDraftKeyRef.current = null
        lastDraftRevIdRef.current = null
        setRecoverableDrafts([])
        setRevisionConflict(null)
        setRevisionDraftVisible(false)
        const userId = res.data.membership?.id ?? authUser?.id
        const userDraft = readDraft(getDraftStorageKey(userId))
        const anonDraft = userId ? readDraft(getDraftStorageKey(null)) : null
        const draft = userDraft ?? anonDraft

        if (draft) {
          setFullName(draft.fullName || res.data.membership?.name || authUser?.name || '')
          setEmail(draft.email || res.data.membership?.email || authUser?.email || '')
          setCity(draft.city || '')
          setPrimaryDomain(draft.primaryDomain || 'GEN')
          setSkills(draft.skills || '')
          setMotivation(draft.motivation || '')
          setTrialTaskTitle(draft.trialTaskTitle || '')
          setTrialTaskUrl(draft.trialTaskUrl || '')
          setInitialPortfolioTitle(draft.initialPortfolioTitle || '')
          setInitialPortfolioDomain(draft.initialPortfolioDomain || draft.primaryDomain || 'GEN')
          setInitialPortfolioSummary(draft.initialPortfolioSummary || '')
          setInitialPortfolioUrl(draft.initialPortfolioUrl || '')
        } else {
          setFullName((prev) => prev || res.data.membership?.name || authUser?.name || '')
          setEmail((prev) => prev || res.data.membership?.email || authUser?.email || '')
        }
      }
      setDraftReady(true)
    } catch (err: unknown) {
      if (gen !== requestGenRef.current) return
      setLoadFailed(true)
      setError(extractApiError(err, 'Не удалось загрузить данные заявки'))
    } finally {
      if (gen === requestGenRef.current) {
        setLoading(false)
      }
    }
  }, [applyApplicationMonotonic, applyRevisionFieldsState, authUser?.email, authUser?.id, authUser?.name, syncRevisionFields])

  useEffect(() => {
    loadMyApplication()
  }, [loadMyApplication])

  // Keep recoverableDrafts synchronized when another tab edits or resolves drafts
  useEffect(() => {
    if (!application) return
    const onStorage = (ev: StorageEvent) => {
      if (ev.key && !isRevisionDraftKeyForApp(ev.key, effectiveUserId, application.id)) return
      const allDrafts = readAllRevisionDrafts(effectiveUserId, application.id)
      setRecoverableDrafts(allDrafts)
      if (allDrafts.length > 0) {
        setRevisionDraftVisible(true)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [application, effectiveUserId])

  // Persist draft in sessionStorage while filling initial form
  useEffect(() => {
    if (!draftReady || loading || application || loadFailed) return
    const key = getDraftStorageKey(effectiveUserId)
    const draft: ApplicationDraft = {
      fullName,
      email,
      city,
      primaryDomain,
      skills,
      motivation,
      trialTaskTitle,
      trialTaskUrl,
      initialPortfolioTitle,
      initialPortfolioDomain,
      initialPortfolioSummary,
      initialPortfolioUrl,
    }
    try {
      sessionStorage.setItem(key, JSON.stringify(draft))
    } catch {
      // Ignore storage quota errors
    }
  }, [
    draftReady,
    loading,
    application,
    loadFailed,
    effectiveUserId,
    fullName,
    email,
    city,
    primaryDomain,
    skills,
    motivation,
    trialTaskTitle,
    trialTaskUrl,
    initialPortfolioTitle,
    initialPortfolioDomain,
    initialPortfolioSummary,
    initialPortfolioUrl,
  ])

  const submitClaimToken = useCallback(
    async (tokenValue: string) => {
      const trimmed = tokenValue.trim()
      if (trimmed.length < 16) {
        const msg = 'Токен привязки должен содержать не менее 16 символов'
        setClaimFeedback({ type: 'error', message: msg })
        toast.error(msg)
        return
      }
      setClaiming(true)
      setClaimFeedback(null)
      try {
        await api.post<{ success: boolean; application: MemberApplication }>(
          '/applications/claim',
          { claim_token: trimmed },
        )
        const successMsg = 'Гостевая заявка успешно привязана к вашему аккаунту.'
        setClaimFeedback({ type: 'success', message: successMsg })
        toast.success(successMsg)
        setClaimTokenInput('')
        if (searchParams.has('claim_token')) {
          const next = new URLSearchParams(searchParams)
          next.delete('claim_token')
          setSearchParams(next, { replace: true })
        }
        await loadMyApplication()
      } catch (err: unknown) {
        const msg = extractApiError(
          err,
          axios.isAxiosError(err) && err.response?.status === 409
            ? 'Эта заявка уже привязана или конфликтует с вашей текущей заявкой.'
            : 'Не удалось привязать заявку по токену',
        )
        setClaimFeedback({ type: 'error', message: msg })
        toast.error(msg)
      } finally {
        setClaiming(false)
      }
    },
    [loadMyApplication, searchParams, setSearchParams],
  )

  useEffect(() => {
    if (urlClaimToken) {
      setClaimExpanded(true)
      setClaimTokenInput(urlClaimToken)
    }
  }, [urlClaimToken])

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
      }>('/applications/my', {
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

      if (res.status === 201) {
        try {
          sessionStorage.removeItem(getDraftStorageKey(effectiveUserId))
          sessionStorage.removeItem(getDraftStorageKey(null))
        } catch {
          // Ignore storage errors
        }
      }

      applyApplicationMonotonic(res.data.application)
      setPortfolio(res.data.portfolio ?? [])
      syncRevisionFields(res.data.application)
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

  const handleSelectRecoverableDraft = (entry: StoredRevisionDraftEntry) => {
    const fresh = readRevisionDraft(entry.key) ?? entry.draft
    applyRevisionFieldsState({
      revFullName: fresh.revFullName,
      revCity: fresh.revCity,
      revPrimaryDomain: fresh.revPrimaryDomain || 'GEN',
      revSkills: fresh.revSkills,
      revMotivation: fresh.revMotivation,
      revTrialTaskTitle: fresh.revTrialTaskTitle,
      revTrialTaskUrl: fresh.revTrialTaskUrl,
    })
    activeDraftKeyRef.current = entry.key
    lastDraftRevIdRef.current = fresh.draftRevId
    setRevisionDraftVisible(true)
    if (application) {
      setRevisionConflict((prev) =>
        prev
          ? { ...prev, draftBaseVersion: fresh.baseVersion }
          : fresh.baseVersion !== application.version || application.status !== 'revision_requested'
            ? {
                serverVersion: application.version,
                serverStatus: application.status,
                draftBaseVersion: fresh.baseVersion,
                serverApplication: application,
              }
            : null,
      )
    }
  }

  const handleDiscardSingleDraft = (entry: StoredRevisionDraftEntry) => {
    if (!application) return
    removeExactRevisionDraft(entry.key, entry.draft.draftRevId)
    if (ownDraftKeyRef.current === entry.key) {
      ownDraftKeyRef.current = null
      ownDraftRevIdRef.current = null
    }
    const remaining = readAllRevisionDrafts(effectiveUserId, application.id)
    setRecoverableDrafts(remaining)
    if (remaining.length === 0) {
      activeDraftKeyRef.current = null
      lastDraftRevIdRef.current = null
      syncRevisionFields(revisionConflict?.serverApplication ?? application)
      setRevisionConflict(null)
      setRevisionDraftVisible(false)
    } else if (activeDraftKeyRef.current === entry.key) {
      const next = remaining[0]
      applyRevisionFieldsState(next.draft)
      activeDraftKeyRef.current = next.key
      lastDraftRevIdRef.current = next.draft.draftRevId
      const serverApp = revisionConflict?.serverApplication ?? application
      if (
        remaining.length === 1 &&
        next.draft.baseVersion === serverApp.version &&
        serverApp.status === 'revision_requested'
      ) {
        setRevisionConflict(null)
      } else {
        setRevisionConflict({
          serverVersion: serverApp.version,
          serverStatus: serverApp.status,
          draftBaseVersion: next.draft.baseVersion,
          serverApplication: serverApp,
        })
      }
    }
  }

  const handleKeepRevisionDraftForNewVersion = () => {
    if (!application || revisionConflict?.refreshFailed) return
    const targetApp = revisionConflict?.serverApplication ?? application
    const legacyKey = getLegacyRevisionDraftKey(effectiveUserId, targetApp.id)
    const prevOwnKey = ownDraftKeyRef.current
    const prevOwnRevId = ownDraftRevIdRef.current
    const prevActiveKey = activeDraftKeyRef.current
    const prevActiveRevId = lastDraftRevIdRef.current
    const existingBefore = readAllRevisionDrafts(effectiveUserId, targetApp.id)

    const nextRevId = generateClientToken('rev-keep')
    const nextKey = getImmutableRevisionDraftKey(effectiveUserId, targetApp.id, nextRevId)
    const wrote = writeRevisionDraft(nextKey, {
      applicationId: targetApp.id,
      baseVersion: targetApp.version,
      draftRevId: nextRevId,
      editorTabId: tabIdRef.current,
      ...revisionFieldsRef.current,
      updatedAt: new Date().toISOString(),
    })
    if (!wrote) {
      toast.error('Не удалось сохранить черновик в локальном хранилище')
      return
    }
    if (prevOwnKey && prevOwnRevId && prevOwnKey !== nextKey) {
      removeExactRevisionDraft(prevOwnKey, prevOwnRevId)
    } else if (
      prevActiveKey &&
      prevActiveRevId &&
      prevActiveKey !== nextKey &&
      (prevActiveKey === legacyKey || existingBefore.length === 1)
    ) {
      removeExactRevisionDraft(prevActiveKey, prevActiveRevId)
    }
    ownDraftKeyRef.current = nextKey
    ownDraftRevIdRef.current = nextRevId
    activeDraftKeyRef.current = nextKey
    lastDraftRevIdRef.current = nextRevId
    const remaining = readAllRevisionDrafts(effectiveUserId, targetApp.id)
    setRecoverableDrafts(remaining)
    const hasOtherUnresolved = remaining.some(
      (entry) => entry.key !== nextKey && entry.draft.baseVersion !== targetApp.version,
    )
    if (hasOtherUnresolved) {
      setRevisionConflict({
        serverVersion: targetApp.version,
        serverStatus: targetApp.status,
        draftBaseVersion: targetApp.version,
        serverApplication: targetApp,
      })
    } else {
      setRevisionConflict(null)
    }
    setRevisionDraftVisible(true)
    toast.success(`Ваши правки сохранены для версии #${targetApp.version}`)
  }

  const handleLoadServerRevisionVersion = () => {
    if (!application || revisionConflict?.refreshFailed) return
    const targetApp = revisionConflict?.serverApplication ?? application
    // Atomic exact-revision cleanup: each immutable `:rev:<revId>` key can only delete that exact
    // revision, so any concurrent newer revision written by another tab survives intact.
    const snapshotToDiscard = recoverableDrafts.length > 0
      ? recoverableDrafts
      : activeDraftKeyRef.current && lastDraftRevIdRef.current
        ? [{ key: activeDraftKeyRef.current, draft: { draftRevId: lastDraftRevIdRef.current } as RevisionDraft }]
        : []
    for (const entry of snapshotToDiscard) {
      removeExactRevisionDraft(entry.key, entry.draft.draftRevId)
    }
    ownDraftKeyRef.current = null
    ownDraftRevIdRef.current = null
    const remaining = readAllRevisionDrafts(effectiveUserId, targetApp.id)
    setRecoverableDrafts(remaining)
    if (remaining.length > 0) {
      const newest = remaining[0]
      applyRevisionFieldsState(newest.draft)
      activeDraftKeyRef.current = newest.key
      lastDraftRevIdRef.current = newest.draft.draftRevId
      setRevisionDraftVisible(true)
      setRevisionConflict({
        serverVersion: targetApp.version,
        serverStatus: targetApp.status,
        draftBaseVersion: newest.draft.baseVersion,
        serverApplication: targetApp,
      })
      toast.warning('Обнаружены более новые правки из другой вкладки — они сохранены')
      return
    }
    activeDraftKeyRef.current = null
    lastDraftRevIdRef.current = null
    syncRevisionFields(targetApp)
    setRevisionConflict(null)
    setRevisionDraftVisible(false)
    toast.info(`Загружена серверная версия #${targetApp.version}`)
  }

  const handleRetryConflictRefresh = async () => {
    setRetryingConflict(true)
    try {
      await loadMyApplication()
    } finally {
      setRetryingConflict(false)
    }
  }

  const handleResubmitRevision = async (e: FormEvent) => {
    e.preventDefault()
    if (!application || revisionConflict) return
    const currentFields = revisionFieldsRef.current
    if (currentFields.revFullName.trim().length < 2) {
      toast.error('Имя должно содержать от 2 символов')
      return
    }

    const appId = application.id
    const baseVer = application.version
    const appStatusAtStart = application.status
    const userIdAtStart = effectiveUserId
    const editSeqAtStart = revisionEditSeqRef.current
    const submittedDraftKey = activeDraftKeyRef.current
    const submittedDraftRevId = lastDraftRevIdRef.current
    const submittedOwnKey = ownDraftKeyRef.current
    const submittedOwnRevId = ownDraftRevIdRef.current

    setSubmittingRevision(true)
    try {
      const res = await api.patch<{ success: boolean; application: MemberApplication }>(
        '/applications/my',
        {
          application_id: appId,
          expected_version: baseVer,
          full_name: currentFields.revFullName.trim(),
          city: currentFields.revCity.trim(),
          primary_domain: currentFields.revPrimaryDomain,
          skills: currentFields.revSkills.trim(),
          motivation: currentFields.revMotivation.trim(),
          trial_task_title: currentFields.revTrialTaskTitle.trim(),
          trial_task_url: currentFields.revTrialTaskUrl.trim(),
        },
      )
      if (activeAppIdRef.current !== appId) {
        return
      }
      const updatedApp = res.data.application
      const appliedNewerSnapshot = applyApplicationMonotonic(updatedApp)

      if (revisionEditSeqRef.current === editSeqAtStart) {
        // Atomic exact-revision cleanup: remove ONLY the submitted immutable revision key.
        // Any newer revision written by another tab lives under its own `:rev:<id>` key and is untouched.
        if (submittedDraftKey && submittedDraftRevId) {
          removeExactRevisionDraft(submittedDraftKey, submittedDraftRevId)
        }
        if (submittedOwnKey && submittedOwnRevId && submittedOwnKey !== submittedDraftKey) {
          removeExactRevisionDraft(submittedOwnKey, submittedOwnRevId)
        }
        if (ownDraftKeyRef.current === submittedOwnKey) {
          ownDraftKeyRef.current = null
          ownDraftRevIdRef.current = null
        }
        const remainingDrafts = readAllRevisionDrafts(userIdAtStart, appId)
        setRecoverableDrafts(remainingDrafts)

        if (remainingDrafts.length === 0) {
          activeDraftKeyRef.current = null
          lastDraftRevIdRef.current = null
          setRevisionConflict((prev) => (prev && prev.draftBaseVersion === baseVer ? null : prev))
          setRevisionDraftVisible(false)
          if (appliedNewerSnapshot) {
            syncRevisionFields(updatedApp)
          }
          toast.success('Доработанная заявка отправлена на повторное рассмотрение')
        } else {
          // Another tab saved a newer unsent draft while PATCH 200 was in flight: preserve it!
          const preserved = remainingDrafts[0]
          applyRevisionFieldsState(preserved.draft)
          activeDraftKeyRef.current = preserved.key
          lastDraftRevIdRef.current = preserved.draft.draftRevId
          setRevisionDraftVisible(true)
          if (appliedNewerSnapshot) {
            setRevisionConflict({
              serverVersion: updatedApp.version,
              serverStatus: updatedApp.status,
              draftBaseVersion: preserved.draft.baseVersion,
              serverApplication: updatedApp,
              refreshFailed: false,
            })
          }
          toast.warning('Заявка отправлена, но более новые правки из другой вкладки сохранены в черновике')
        }
      } else {
        // User typed newer edits in THIS tab while PATCH was in flight: already persisted under ownDraftKeyRef
        setRecoverableDrafts(readAllRevisionDrafts(userIdAtStart, appId))
        setRevisionDraftVisible(true)
        if (appliedNewerSnapshot) {
          setRevisionConflict({
            serverVersion: updatedApp.version,
            serverStatus: updatedApp.status,
            draftBaseVersion: baseVer,
            serverApplication: updatedApp,
            refreshFailed: false,
          })
        }
        toast.warning('Заявка отправлена, но ваши более новые правки сохранены в черновике')
      }
    } catch (err: unknown) {
      if (activeAppIdRef.current !== appId) {
        return
      }
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        const hasLocalEdits = revisionEditSeqRef.current !== editSeqAtStart
        const allBeforeWrite = readAllRevisionDrafts(userIdAtStart, appId)
        const hasAnyDraft = allBeforeWrite.length > 0

        // Never overwrite another tab's key. Only persist a snapshot if no draft exists at all.
        if (!hasLocalEdits && !hasAnyDraft) {
          const nextRevId = generateClientToken('rev-409')
          const nextKey = getImmutableRevisionDraftKey(userIdAtStart, appId, nextRevId)
          if (
            writeRevisionDraft(nextKey, {
              applicationId: appId,
              baseVersion: baseVer,
              draftRevId: nextRevId,
              editorTabId: tabIdRef.current,
              ...revisionFieldsRef.current,
              updatedAt: new Date().toISOString(),
            })
          ) {
            ownDraftKeyRef.current = nextKey
            ownDraftRevIdRef.current = nextRevId
            activeDraftKeyRef.current = nextKey
            lastDraftRevIdRef.current = nextRevId
          }
        }

        const allAfter = readAllRevisionDrafts(userIdAtStart, appId)
        setRecoverableDrafts(allAfter)
        if (!hasLocalEdits && allAfter.length > 0) {
          const newest = allAfter[0]
          applyRevisionFieldsState(newest.draft)
          activeDraftKeyRef.current = newest.key
          lastDraftRevIdRef.current = newest.draft.draftRevId
        }
        setRevisionDraftVisible(true)
        toast.warning(
          extractApiError(
            err,
            'Версия заявки изменилась. Ваши правки сохранены — выберите действие.',
          ),
        )
        try {
          const freshRes = await api.get<MyApplicationResponse>('/applications/my')
          if (activeAppIdRef.current !== appId) {
            return
          }
          const freshApp = freshRes.data.application ?? null
          if (freshApp && freshApp.id === appId) {
            if (!applyApplicationMonotonic(freshApp)) {
              return
            }
            setPortfolio(freshRes.data.portfolio ?? [])
            setMembership(freshRes.data.membership ?? null)
            const latestDrafts = readAllRevisionDrafts(userIdAtStart, appId)
            setRecoverableDrafts(latestDrafts)
            const activeEntry =
              latestDrafts.find((entry) => entry.key === activeDraftKeyRef.current) ??
              latestDrafts[0] ??
              null
            setRevisionConflict({
              serverVersion: freshApp.version,
              serverStatus: freshApp.status,
              draftBaseVersion: activeEntry?.draft.baseVersion ?? baseVer,
              serverApplication: freshApp,
              refreshFailed: false,
            })
          } else if (baseVer >= latestAppVersionRef.current) {
            setRevisionConflict({
              serverVersion: baseVer,
              serverStatus: appStatusAtStart,
              draftBaseVersion: baseVer,
              serverApplication: null,
              refreshFailed: true,
            })
          }
        } catch {
          if (activeAppIdRef.current !== appId || baseVer < latestAppVersionRef.current) {
            return
          }
          setRevisionConflict({
            serverVersion: baseVer,
            serverStatus: appStatusAtStart,
            draftBaseVersion: baseVer,
            serverApplication: null,
            refreshFailed: true,
          })
        }
      } else {
        toast.error(extractApiError(err, 'Не удалось отправить доработанную заявку'))
      }
    } finally {
      setSubmittingRevision(false)
    }
  }

  const handleAddPortfolioItem = async (e: FormEvent) => {
    e.preventDefault()
    if (newItemTitle.trim().length < 2) {
      toast.error('Укажите название работы в портфолио (от 2 символов)')
      return
    }

    const appId = application?.id ?? null
    const prevVersion = application?.version
    const appStatusAtStart = application?.status
    const userIdAtStart = effectiveUserId
    setSubmittingPortfolio(true)
    try {
      const res = await api.post<{
        success: boolean
        item: PortfolioItem
        application_version?: number
      }>('/applications/my/portfolio', {
        title: newItemTitle.trim(),
        domain_code: newItemDomain,
        summary: newItemSummary.trim(),
        artifact_url: newItemUrl.trim(),
      })
      const itemAppId = res.data.item?.application_id ?? appId
      if (
        appId !== null &&
        (activeAppIdRef.current !== appId ||
          (typeof itemAppId === 'number' && itemAppId !== appId))
      ) {
        return
      }
      setPortfolio((prev) =>
        prev.some((p) => p.id === res.data.item.id) ? prev : [res.data.item, ...prev],
      )
      const nextVersion =
        res.data.application_version ?? (typeof prevVersion === 'number' ? prevVersion + 1 : 1)

      let detectedConcurrentChange = false
      if (appId !== null && appStatusAtStart) {
        const activeKey = activeDraftKeyRef.current ?? ownDraftKeyRef.current
        const activeDraft = activeKey ? readRevisionDraft(activeKey) : null
        const allDrafts = readAllRevisionDrafts(userIdAtStart, appId)
        setRecoverableDrafts(allDrafts)
        const otherTabDrafts = allDrafts.filter((entry) => entry.key !== activeKey)

        if (
          typeof prevVersion === 'number' &&
          nextVersion === prevVersion + 1 &&
          nextVersion >= latestAppVersionRef.current &&
          (!activeDraft || activeDraft.baseVersion === prevVersion)
        ) {
          latestAppVersionRef.current = Math.max(latestAppVersionRef.current, nextVersion)
          setApplication((prev) =>
            prev && prev.id === appId
              ? { ...prev, version: Math.max(prev.version, nextVersion) }
              : prev,
          )
          // Rebase the currently selected active draft into a NEW immutable `:rev:<id>` key
          // (never overwriting another tab's key and never reusing an old draftRevId).
          if (activeDraft && activeKey) {
            const rebasedRevId = generateClientToken('rev-rebase')
            const rebasedKey = getImmutableRevisionDraftKey(userIdAtStart, appId, rebasedRevId)
            const wroteRebase = writeRevisionDraft(rebasedKey, {
              ...activeDraft,
              baseVersion: nextVersion,
              draftRevId: rebasedRevId,
              editorTabId: tabIdRef.current,
              updatedAt: new Date().toISOString(),
            })
            if (wroteRebase) {
              if (activeKey === ownDraftKeyRef.current || allDrafts.length === 1) {
                removeExactRevisionDraft(activeKey, activeDraft.draftRevId)
              }
              ownDraftKeyRef.current = rebasedKey
              ownDraftRevIdRef.current = rebasedRevId
              activeDraftKeyRef.current = rebasedKey
              lastDraftRevIdRef.current = rebasedRevId
              setRevisionConflict((prev) =>
                prev
                  ? { ...prev, serverVersion: nextVersion, draftBaseVersion: nextVersion }
                  : null,
              )
            }
            setRecoverableDrafts(readAllRevisionDrafts(userIdAtStart, appId))
          }
          if (otherTabDrafts.length > 0) {
            setRevisionDraftVisible(true)
          }
        } else if (
          typeof prevVersion === 'number' &&
          (nextVersion > prevVersion + 1 ||
            nextVersion < latestAppVersionRef.current ||
            (activeDraft && activeDraft.baseVersion !== prevVersion))
        ) {
          // Do NOT publish nextVersion onto application before refreshing & reconciling concurrent changes
          const primaryDraft = activeDraft ?? allDrafts[0]?.draft ?? null
          detectedConcurrentChange = Boolean(primaryDraft)
          if (primaryDraft && nextVersion >= latestAppVersionRef.current) {
            setRevisionConflict({
              serverVersion: nextVersion,
              serverStatus: appStatusAtStart,
              draftBaseVersion: primaryDraft.baseVersion,
              serverApplication: null,
              refreshFailed: true,
            })
            setRevisionDraftVisible(true)
          }
          try {
            const freshRes = await api.get<MyApplicationResponse>('/applications/my')
            if (activeAppIdRef.current !== appId) {
              return
            }
            const freshApp = freshRes.data.application ?? null
            const postRefreshDrafts = readAllRevisionDrafts(userIdAtStart, appId)
            setRecoverableDrafts(postRefreshDrafts)
            const postRefreshDraft = postRefreshDrafts[0]?.draft ?? null
            if (freshApp && freshApp.id === appId) {
              if (!applyApplicationMonotonic(freshApp)) {
                return
              }
              setPortfolio(freshRes.data.portfolio ?? [])
              setMembership(freshRes.data.membership ?? null)
              if (postRefreshDraft) {
                setRevisionConflict({
                  serverVersion: freshApp.version,
                  serverStatus: freshApp.status,
                  draftBaseVersion: postRefreshDraft.baseVersion,
                  serverApplication: freshApp,
                  refreshFailed: false,
                })
                setRevisionDraftVisible(true)
              } else {
                syncRevisionFields(freshApp)
              }
            } else if (postRefreshDraft && nextVersion >= latestAppVersionRef.current) {
              setRevisionConflict({
                serverVersion: nextVersion,
                serverStatus: appStatusAtStart,
                draftBaseVersion: postRefreshDraft.baseVersion,
                serverApplication: null,
                refreshFailed: true,
              })
              setRevisionDraftVisible(true)
            }
          } catch {
            if (activeAppIdRef.current !== appId) {
              return
            }
            const postRefreshDrafts = readAllRevisionDrafts(userIdAtStart, appId)
            setRecoverableDrafts(postRefreshDrafts)
            const postRefreshDraft = postRefreshDrafts[0]?.draft ?? null
            if (postRefreshDraft && nextVersion >= latestAppVersionRef.current) {
              setRevisionConflict({
                serverVersion: nextVersion,
                serverStatus: appStatusAtStart,
                draftBaseVersion: postRefreshDraft.baseVersion,
                serverApplication: null,
                refreshFailed: true,
              })
              setRevisionDraftVisible(true)
            }
          }
        }
      }
      setNewItemTitle('')
      setNewItemSummary('')
      setNewItemUrl('')
      if (detectedConcurrentChange) {
        toast.warning('Работа добавлена в портфолио, но заявка изменилась на сервере — проверьте конфликт версий')
      } else {
        toast.success('Работа добавлена в портфолио')
      }
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

      {(error || loadFailed) && (
        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle size={18} className="shrink-0" />
              <span>{error || 'Не удалось загрузить данные заявки'}</span>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() => {
                setLoading(true)
                loadMyApplication()
              }}
            >
              Повторить загрузку
            </Button>
          </div>
        </Card>
      )}

      {/* Membership Status Banner (hidden when load failed so fake observer banner never renders) */}
      {!loadFailed && (
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
      )}

      {/* Expandable Guest Application Claim Panel */}
      {!loadFailed && !application && (
        <Card padding="sm">
          <button
            type="button"
            onClick={() => setClaimExpanded((prev) => !prev)}
            className="w-full flex items-center justify-between text-left gap-3"
          >
            <div className="flex items-center gap-2">
              <KeyRound size={16} className="text-accent" />
              <span className="text-sm font-medium text-text">
                Привязать гостевую заявку по токену
              </span>
            </div>
            {claimExpanded ? (
              <ChevronUp size={16} className="text-text-muted" />
            ) : (
              <ChevronDown size={16} className="text-text-muted" />
            )}
          </button>

          {claimExpanded && (
            <form
              onSubmit={(e) => {
                e.preventDefault()
                submitClaimToken(claimTokenInput)
              }}
              className="mt-4 pt-3 border-t border-border space-y-3"
            >
              <p className="text-xs text-text-secondary">
                Если вы отправляли заявку без входа в аккаунт и получили одноразовый{' '}
                <code>claim_token</code>, введите его ниже, чтобы привязать заявку к профилю.
              </p>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="flex-1">
                  <Input
                    value={claimTokenInput}
                    onChange={(e) => setClaimTokenInput(e.target.value)}
                    placeholder="Вставьте claim_token (минимум 16 символов)"
                    disabled={claiming}
                  />
                </div>
                <Button type="submit" loading={claiming} size="md">
                  Привязать заявку
                </Button>
              </div>
              {claimFeedback && (
                <p
                  className={`text-xs ${
                    claimFeedback.type === 'success' ? 'text-green' : 'text-red-400'
                  }`}
                >
                  {claimFeedback.message}
                </p>
              )}
            </form>
          )}
        </Card>
      )}

      {/* Either New Application Form OR Existing Application + Portfolio */}
      {loadFailed && !application ? null : !application ? (
        <Card>
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Briefcase size={18} className="text-accent" />
              <h2 className="text-lg font-semibold font-display">Подача заявки специалиста</h2>
            </div>
            <span className="text-xs text-text-muted">
              Черновик автоматически сохраняется в текущей сессии браузера
            </span>
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

            {/* Prominent reviewer feedback when revision is requested */}
            {application.status === 'revision_requested' && (
              <div className="mb-5 p-4 rounded-lg bg-amber-500/10 border border-amber-500/30 space-y-1.5">
                <div className="flex items-center gap-2 text-amber-400 text-sm font-semibold">
                  <RotateCcw size={16} />
                  <span>Требуется доработка заявки</span>
                </div>
                <p className="text-xs text-text-muted">
                  Комментарий рецензента
                  {application.reviewed_at
                    ? ` (${new Date(application.reviewed_at).toLocaleDateString('ru-RU')})`
                    : ''}
                  :
                </p>
                <p className="text-sm text-text whitespace-pre-line">
                  {application.review_note || 'Рецензент запросил уточнение данных заявки.'}
                </p>
              </div>
            )}

            {revisionConflict && (
              <div className="mb-5 p-4 rounded-lg bg-red-500/10 border border-red-500/30 space-y-3">
                <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                  <AlertCircle size={16} />
                  <span>
                    {revisionConflict.refreshFailed ? (
                      'Версия заявки изменилась на сервере, но не удалось загрузить актуальные данные'
                    ) : (
                      <>
                        Обнаружено изменение заявки на сервере (версия #{revisionConflict.serverVersion}, статус:{' '}
                        {(APPLICATION_STATUS_META[revisionConflict.serverStatus] ?? {
                          label: revisionConflict.serverStatus,
                        }).label}
                        )
                      </>
                    )}
                  </span>
                </div>
                <p className="text-xs text-text-secondary">
                  Ваш локальный черновик доработки создавался для версии #{revisionConflict.draftBaseVersion}.
                  {revisionConflict.refreshFailed
                    ? ' Ваши локальные правки сохранены. Обновите версию с сервера перед выбором действия.'
                    : revisionConflict.serverStatus === 'revision_requested'
                      ? ' Выберите, сохранить ли локальные правки для новой версии или загрузить серверные данные.'
                      : ' Статус заявки изменился и повторная отправка отключена. Ваши локальные правки сохранены ниже для копирования.'}
                </p>
                {revisionConflict.refreshFailed ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={retryingConflict}
                      onClick={handleRetryConflictRefresh}
                    >
                      <RotateCcw size={14} />
                      Обновить версию с сервера
                    </Button>
                  </div>
                ) : (
                  revisionConflict.serverStatus === 'revision_requested' && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="primary"
                        onClick={handleKeepRevisionDraftForNewVersion}
                      >
                        Сохранить мои правки для версии #{revisionConflict.serverVersion}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleLoadServerRevisionVersion}
                      >
                        Загрузить серверную версию #{revisionConflict.serverVersion}
                      </Button>
                    </div>
                  )
                )}
                {recoverableDrafts.length > 1 && (
                  <div className="pt-2 border-t border-red-500/20 space-y-2">
                    <p className="text-xs font-medium text-text">
                      Сохранено несколько версий черновика ({recoverableDrafts.length}):
                    </p>
                    <div className="space-y-1.5">
                      {recoverableDrafts.map((entry, idx) => {
                        const isSelected = activeDraftKeyRef.current === entry.key
                        return (
                          <div
                            key={entry.key}
                            className="flex flex-wrap items-center justify-between gap-2 p-2 rounded bg-bg-card/80 border border-border text-xs"
                          >
                            <div className="space-y-0.5 min-w-0 flex-1">
                              <div className="font-medium text-text">
                                Черновик #{idx + 1} (база v{entry.draft.baseVersion})
                                {isSelected ? ' · выбран' : ''}
                              </div>
                              <div className="text-text-secondary truncate">
                                Навыки: {entry.draft.revSkills || '—'} · Мотивация:{' '}
                                {entry.draft.revMotivation || '—'}
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <Button
                                type="button"
                                size="sm"
                                variant={isSelected ? 'primary' : 'secondary'}
                                onClick={() => handleSelectRecoverableDraft(entry)}
                              >
                                Открыть
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                onClick={() => handleDiscardSingleDraft(entry)}
                              >
                                Удалить
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {application.status === 'revision_requested' ? (
              <form onSubmit={handleResubmitRevision} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="ФИО *"
                    value={revFullName}
                    onChange={(e) => updateRevisionField('revFullName', e.target.value)}
                    required
                  />
                  <Input
                    label="Город / регион"
                    value={revCity}
                    onChange={(e) => updateRevisionField('revCity', e.target.value)}
                  />
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="rev-primary-domain"
                    className="text-sm font-medium text-text-secondary"
                  >
                    Основной инженерный домен
                  </label>
                  <select
                    id="rev-primary-domain"
                    value={revPrimaryDomain}
                    onChange={(e) => updateRevisionField('revPrimaryDomain', e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text focus:outline-none focus:border-accent transition-colors"
                  >
                    {SETTLEMENT_DOMAINS.map((d) => (
                      <option key={d.code} value={d.code}>
                        {d.code} — {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                <Textarea
                  label="Навыки и компетенции"
                  value={revSkills}
                  onChange={(e) => updateRevisionField('revSkills', e.target.value)}
                  rows={3}
                />

                <Textarea
                  label="Мотивация участия"
                  value={revMotivation}
                  onChange={(e) => updateRevisionField('revMotivation', e.target.value)}
                  rows={3}
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Название тестового задания"
                    value={revTrialTaskTitle}
                    onChange={(e) => updateRevisionField('revTrialTaskTitle', e.target.value)}
                  />
                  <Input
                    label="Ссылка на тестовое задание"
                    type="url"
                    value={revTrialTaskUrl}
                    onChange={(e) => updateRevisionField('revTrialTaskUrl', e.target.value)}
                    placeholder="https://..."
                  />
                </div>

                <div className="flex justify-end pt-2">
                  <Button
                    type="submit"
                    loading={submittingRevision}
                    disabled={Boolean(revisionConflict)}
                  >
                    <RotateCcw size={15} />
                    Отправить доработанную заявку
                  </Button>
                </div>
              </form>
            ) : (
              <>
                {revisionDraftVisible && (
                  <div className="mb-5 p-4 rounded-lg bg-bg-elevated border border-amber-500/30 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <p className="text-sm font-semibold text-amber-400">
                        Сохранённые локальные правки (только чтение, повторная отправка недоступна)
                      </p>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleLoadServerRevisionVersion}
                      >
                        Очистить черновик
                      </Button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-text-secondary">
                      <div>
                        <span className="text-text-muted">ФИО:</span>{' '}
                        <span className="text-text select-all">{revFullName || '—'}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Город:</span>{' '}
                        <span className="text-text select-all">{revCity || '—'}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Домен:</span>{' '}
                        <span className="text-text select-all">{revPrimaryDomain}</span>
                      </div>
                      <div>
                        <span className="text-text-muted">Тестовое задание:</span>{' '}
                        <span className="text-text select-all">
                          {revTrialTaskTitle || '—'} {revTrialTaskUrl ? `(${revTrialTaskUrl})` : ''}
                        </span>
                      </div>
                    </div>
                    {revSkills && (
                      <div className="text-xs">
                        <p className="text-text-muted mb-0.5">Навыки:</p>
                        <p className="text-text whitespace-pre-line select-all">{revSkills}</p>
                      </div>
                    )}
                    {revMotivation && (
                      <div className="text-xs">
                        <p className="text-text-muted mb-0.5">Мотивация:</p>
                        <p className="text-text whitespace-pre-line select-all">{revMotivation}</p>
                      </div>
                    )}
                  </div>
                )}
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
              </>
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
