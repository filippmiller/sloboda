import { useState, useEffect, useCallback, useRef } from 'react'
import axios from 'axios'
import { toast } from 'sonner'
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  TrendingUp,
  TrendingDown,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Search,
  Coins,
  ShieldCheck,
  AlertTriangle,
  RotateCcw,
  XCircle,
} from 'lucide-react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import {
  extractApiError,
  rublesToKopecksString,
  type AdminLedgerExpense,
  type AdminLedgerSummary,
  type ConstructionMilestone,
  type LedgerContribution,
} from '@/types/core'

interface FinanceSummary {
  totalIncome: number
  totalExpenses: number
  balance: number
  transactionCount: number
  expenseBreakdown: { category: string; total: number }[]
}

interface Transaction {
  id: number
  type: 'income' | 'expense'
  category: string
  amount: string
  description: string
  counterparty: string | null
  date: string
  source: string
  is_verified: boolean
  created_by_name: string | null
  created_at: string
}

interface TransactionForm {
  type: 'income' | 'expense'
  category: string
  amount: string
  description: string
  counterparty: string
  date: string
}

type AdminFinanceTab = 'ledger' | 'legacy'

const INCOME_CATEGORIES = [
  { value: 'donation', label: 'Пожертвования' },
  { value: 'grant', label: 'Гранты' },
  { value: 'other_income', label: 'Прочие поступления' },
]

const EXPENSE_CATEGORIES = [
  { value: 'legal', label: 'Юридическая работа' },
  { value: 'platform', label: 'Платформа и хостинг' },
  { value: 'operations', label: 'Операционные расходы' },
  { value: 'equipment', label: 'Оборудование' },
  { value: 'land', label: 'Земля' },
  { value: 'reserve', label: 'Резервный фонд' },
  { value: 'ai_tools', label: 'ИИ-инструменты' },
  { value: 'other_expense', label: 'Прочие расходы' },
]

const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES]

const CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  ALL_CATEGORIES.map((c) => [c.value, c.label]),
)

const LEGAL_RIGHT_OPTIONS = [
  { value: 'observer_trace', label: 'Наблюдательный след (observer_trace)' },
  { value: 'cooperative_share', label: 'Кооперативный пай (cooperative_share)' },
  { value: 'direct_fraction', label: 'Прямая доля (direct_fraction)' },
] as const

const EXPENSE_STATUS_BADGE: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' }
> = {
  reserved: { label: 'Резерв', variant: 'warning' },
  paid: { label: 'Оплачен', variant: 'success' },
  cancelled: { label: 'Отменён', variant: 'default' },
  disputed: { label: 'Оспорен', variant: 'danger' },
}

const DEFAULT_SETTLEMENT_ID = 'sloboda-pilot'
const LEDGER_PAGE_SIZE = 25

const LEDGER_MODE_META: Record<
  string,
  { label: string; variant: 'success' | 'warning' | 'default' }
> = {
  verified_receipt: {
    label: 'Подтверждён (verified_receipt)',
    variant: 'success',
  },
  pledge: {
    label: 'Обещание (pledge — не расходуется)',
    variant: 'warning',
  },
  legacy_import: {
    label: 'Импорт (legacy_import)',
    variant: 'default',
  },
}

const CONTRIB_MODE_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'verified_receipt', label: 'verified_receipt' },
  { value: 'pledge', label: 'pledge' },
  { value: 'legacy_import', label: 'legacy_import' },
] as const

const EXPENSE_STATUS_FILTERS = [
  { value: '', label: 'Все' },
  { value: 'reserved', label: 'В резерве (reserved)' },
  { value: 'disputed', label: 'Спор (disputed)' },
  { value: 'paid', label: 'Оплачено (paid)' },
  { value: 'cancelled', label: 'Отменено (cancelled)' },
] as const

function generateIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`
}

function formatRubles(amount: number): string {
  return Math.round((amount * 100) / 100).toLocaleString('ru-RU') + ' ₽'
}

const emptyForm: TransactionForm = {
  type: 'expense',
  category: 'legal',
  amount: '',
  description: '',
  counterparty: '',
  date: new Date().toISOString().split('T')[0],
}

export default function AdminFinance() {
  const [activeTab, setActiveTab] = useState<AdminFinanceTab>('ledger')

  // ============================================
  // NEW VERIFIED KOPECK LEDGER STATE
  // ============================================
  const [selectedSettlement, setSelectedSettlement] = useState<string>(DEFAULT_SETTLEMENT_ID)
  const [availableSettlements, setAvailableSettlements] = useState<string[]>([DEFAULT_SETTLEMENT_ID])
  const [contribModeFilter, setContribModeFilter] = useState<string>('')
  const [contribPage, setContribPage] = useState(0)
  const [contribTotal, setContribTotal] = useState(0)
  const [contribHasMore, setContribHasMore] = useState(false)
  const [expenseStatusFilter, setExpenseStatusFilter] = useState<string>('')
  const [expensePage, setExpensePage] = useState(0)
  const [expenseTotal, setExpenseTotal] = useState(0)
  const [expenseHasMore, setExpenseHasMore] = useState(false)
  const [refreshedConflictExpense, setRefreshedConflictExpense] = useState<AdminLedgerExpense | null>(null)
  const [loadedSettlement, setLoadedSettlement] = useState<string | null>(null)
  const [loadedExpenseScope, setLoadedExpenseScope] = useState<string | null>(null)
  const [loadedContribScope, setLoadedContribScope] = useState<string | null>(null)
  const ledgerFetchSeqRef = useRef(0)
  const ledgerParamsRef = useRef({
    selectedSettlement,
    contribModeFilter,
    contribPage,
    expenseStatusFilter,
    expensePage,
  })

  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [ledgerSummary, setLedgerSummary] = useState<AdminLedgerSummary | null>(null)
  const [contributions, setContributions] = useState<LedgerContribution[]>([])
  const [expenses, setExpenses] = useState<AdminLedgerExpense[]>([])
  const [milestones, setMilestones] = useState<ConstructionMilestone[]>([])
  const [ledgerError, setLedgerError] = useState<string | null>(null)

  // Contribution form
  const [contribName, setContribName] = useState('')
  const [contribAmountRubles, setContribAmountRubles] = useState('')
  const [contribPurpose, setContribPurpose] = useState('general')
  const [contribLegalRight, setContribLegalRight] = useState<string>('observer_trace')
  const [contribShareClass, setContribShareClass] = useState('')
  const [contribUserId, setContribUserId] = useState('')
  const [contribIdempKey, setContribIdempKey] = useState(generateIdempotencyKey)
  const [savingContrib, setSavingContrib] = useState(false)

  // Expense form
  const [expTitle, setExpTitle] = useState('')
  const [expCategory, setExpCategory] = useState('equipment')
  const [expAmountRubles, setExpAmountRubles] = useState('')
  const [expPurpose, setExpPurpose] = useState('general')
  const [expAllocationRule, setExpAllocationRule] = useState<'fifo' | 'proportional'>('fifo')
  const [expMilestoneId, setExpMilestoneId] = useState('')
  const [expMarkPaid, setExpMarkPaid] = useState(false)
  const [expIdempKey, setExpIdempKey] = useState(generateIdempotencyKey)
  const [savingExpense, setSavingExpense] = useState(false)
  const [transitioningExpenseId, setTransitioningExpenseId] = useState<number | null>(null)

  // ============================================
  // LEGACY OPERATIONAL JOURNAL STATE
  // ============================================
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const limit = 30

  // Modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [form, setForm] = useState<TransactionForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete state
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const concreteSettlement =
    selectedSettlement === 'all' ? DEFAULT_SETTLEMENT_ID : selectedSettlement
  const currentExpenseScope = `${selectedSettlement}::${expenseStatusFilter}::${expensePage}`
  const currentContribScope = `${selectedSettlement}::${contribModeFilter}::${contribPage}`
  const summaryAligned = loadedSettlement === selectedSettlement
  const expensesAligned = summaryAligned && loadedExpenseScope === currentExpenseScope
  const contribsAligned = summaryAligned && loadedContribScope === currentContribScope

  const fetchLedgerData = useCallback(async () => {
    const {
      selectedSettlement: targetSettlement,
      contribModeFilter: targetContribMode,
      contribPage: targetContribPage,
      expenseStatusFilter: targetExpenseStatus,
      expensePage: targetExpensePage,
    } = ledgerParamsRef.current

    const seq = ++ledgerFetchSeqRef.current
    setLedgerLoading(true)
    setLedgerError(null)
    const milestoneSettlement =
      targetSettlement === 'all' ? DEFAULT_SETTLEMENT_ID : targetSettlement

    const [contribRes, expRes, summaryRes, milestonesRes] = await Promise.allSettled([
      adminApi.get<{
        success: boolean
        contributions: LedgerContribution[]
        total?: number
        has_more?: boolean
      }>('/admin/ledger/contributions', {
        params: {
          settlement_id: targetSettlement,
          ledger_mode: targetContribMode || undefined,
          limit: LEDGER_PAGE_SIZE,
          offset: targetContribPage * LEDGER_PAGE_SIZE,
        },
      }),
      adminApi.get<{
        success: boolean
        expenses: AdminLedgerExpense[]
        total?: number
        has_more?: boolean
      }>('/admin/ledger/expenses', {
        params: {
          settlement_id: targetSettlement,
          status: targetExpenseStatus || undefined,
          limit: LEDGER_PAGE_SIZE,
          offset: targetExpensePage * LEDGER_PAGE_SIZE,
        },
      }),
      adminApi.get<{ success: boolean } & AdminLedgerSummary>('/admin/ledger/summary', {
        params: { settlement_id: targetSettlement },
      }),
      adminApi.get<{ success: boolean; milestones: ConstructionMilestone[] }>(
        '/public/construction/milestones',
        { params: { settlement_id: milestoneSettlement } },
      ),
    ])

    if (seq !== ledgerFetchSeqRef.current) {
      return
    }

    const errors: string[] = []
    if (contribRes.status === 'fulfilled') {
      const items = contribRes.value.data.contributions ?? []
      const totalCount =
        typeof contribRes.value.data.total === 'number'
          ? contribRes.value.data.total
          : items.length
      const hasMore =
        typeof contribRes.value.data.has_more === 'boolean'
          ? contribRes.value.data.has_more
          : (targetContribPage + 1) * LEDGER_PAGE_SIZE < totalCount
      setContributions(items)
      setContribTotal(totalCount)
      setContribHasMore(hasMore)
      setLoadedContribScope(`${targetSettlement}::${targetContribMode}::${targetContribPage}`)
    } else {
      setContributions([])
      setContribTotal(0)
      setContribHasMore(false)
      setLoadedContribScope(null)
      errors.push(extractApiError(contribRes.reason, 'взносы'))
    }

    if (expRes.status === 'fulfilled') {
      const items = expRes.value.data.expenses ?? []
      const totalCount =
        typeof expRes.value.data.total === 'number'
          ? expRes.value.data.total
          : items.length
      const hasMore =
        typeof expRes.value.data.has_more === 'boolean'
          ? expRes.value.data.has_more
          : (targetExpensePage + 1) * LEDGER_PAGE_SIZE < totalCount
      setExpenses(items)
      setExpenseTotal(totalCount)
      setExpenseHasMore(hasMore)
      setLoadedExpenseScope(`${targetSettlement}::${targetExpenseStatus}::${targetExpensePage}`)
    } else {
      setExpenses([])
      setExpenseTotal(0)
      setExpenseHasMore(false)
      setLoadedExpenseScope(null)
      errors.push(extractApiError(expRes.reason, 'расходы'))
    }

    if (summaryRes.status === 'fulfilled') {
      const summaryData = summaryRes.value.data
      setLedgerSummary(summaryData)
      setLoadedSettlement(targetSettlement)
      if (Array.isArray(summaryData.settlements) && summaryData.settlements.length > 0) {
        const normalized = Array.from(
          new Set(
            [DEFAULT_SETTLEMENT_ID, ...summaryData.settlements].filter(
              (s): s is string => typeof s === 'string' && s.trim().length > 0 && s !== 'all',
            ),
          ),
        )
        setAvailableSettlements(normalized)
      }
    } else {
      setLedgerSummary(null)
      setLoadedSettlement(null)
      errors.push(extractApiError(summaryRes.reason, 'сводка реестра'))
    }

    if (milestonesRes.status === 'fulfilled') {
      setMilestones(milestonesRes.value.data.milestones ?? [])
    } else {
      setMilestones([])
    }

    if (errors.length > 0) {
      setLedgerError(`Часть данных реестра не загрузилась: ${errors.join('; ')}`)
    }
    setLedgerLoading(false)
  }, [])

  const fetchSummary = useCallback(async () => {
    try {
      const res = await adminApi.get('/admin/finance/summary')
      setSummary(res.data.data)
    } catch {
      // Non-critical
    }
  }, [])

  const fetchTransactions = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = { limit, offset: page * limit }
      if (filter !== 'all') params.type = filter
      if (search.trim()) params.search = search.trim()
      const res = await adminApi.get('/admin/finance/transactions', { params })
      setTransactions(res.data.data ?? [])
      setTotal(res.data.total ?? 0)
    } catch {
      toast.error('Не удалось загрузить транзакции')
    } finally {
      setLoading(false)
    }
  }, [filter, search, page])

  useEffect(() => {
    ledgerParamsRef.current = {
      selectedSettlement,
      contribModeFilter,
      contribPage,
      expenseStatusFilter,
      expensePage,
    }
    fetchLedgerData()
  }, [
    selectedSettlement,
    contribModeFilter,
    contribPage,
    expenseStatusFilter,
    expensePage,
    fetchLedgerData,
  ])

  useEffect(() => {
    fetchSummary()
  }, [fetchSummary])

  useEffect(() => {
    fetchTransactions()
  }, [fetchTransactions])

  const handleRecordContribution = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!contribName.trim()) {
      toast.error('Укажите имя вкладчика')
      return
    }
    const kopecks = rublesToKopecksString(contribAmountRubles)
    if (!kopecks) {
      toast.error('Введите положительную сумму в рублях (например: 1500 или 1500.50)')
      return
    }

    setSavingContrib(true)
    try {
      const payload: Record<string, unknown> = {
        idempotency_key: contribIdempKey,
        settlement_id: concreteSettlement,
        contributor_name: contribName.trim(),
        amount_kopecks: kopecks,
        purpose: contribPurpose.trim() || 'general',
        legal_right_type: contribLegalRight,
      }
      if (contribShareClass.trim()) {
        payload.share_class = contribShareClass.trim()
      }
      if (contribUserId.trim()) {
        payload.user_id = Number(contribUserId.trim())
      }

      const res = await adminApi.post<{ success: boolean; idempotent_replay?: boolean }>(
        '/admin/ledger/contributions',
        payload,
      )
      toast.success(
        res.data.idempotent_replay
          ? 'Взнос уже был учтён (idempotent replay)'
          : 'Верифицированный взнос записан в реестр',
      )
      setContribName('')
      setContribAmountRubles('')
      setContribShareClass('')
      setContribUserId('')
      setContribIdempKey(generateIdempotencyKey())
      await fetchLedgerData()
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось записать взнос'))
    } finally {
      setSavingContrib(false)
    }
  }

  const handleCreateExpense = async (e: React.FormEvent) => {
    e.preventDefault()
    if (expTitle.trim().length < 2) {
      toast.error('Укажите название расхода (от 2 символов)')
      return
    }
    const kopecks = rublesToKopecksString(expAmountRubles)
    if (!kopecks) {
      toast.error('Введите положительную сумму расхода в рублях')
      return
    }

    setSavingExpense(true)
    try {
      const payload: Record<string, unknown> = {
        idempotency_key: expIdempKey,
        settlement_id: concreteSettlement,
        title: expTitle.trim(),
        category: expCategory,
        amount_kopecks: kopecks,
        purpose: expPurpose.trim() || 'general',
        allocation_rule: expAllocationRule,
        mark_paid: expMarkPaid,
      }
      if (expMilestoneId) {
        payload.milestone_id = Number(expMilestoneId)
      }

      const res = await adminApi.post<{ success: boolean; idempotent_replay?: boolean }>(
        '/admin/ledger/expenses',
        payload,
      )
      toast.success(
        res.data.idempotent_replay
          ? 'Расход уже проведён (idempotent replay)'
          : 'Расход создан и аллоцирован',
      )
      setExpTitle('')
      setExpAmountRubles('')
      setExpMilestoneId('')
      setExpMarkPaid(false)
      setExpIdempKey(generateIdempotencyKey())
      await fetchLedgerData()
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Не удалось провести расход'))
    } finally {
      setSavingExpense(false)
    }
  }

  const handleExpenseTransition = async (
    exp: AdminLedgerExpense,
    nextStatus: 'paid' | 'cancelled' | 'disputed' | 'reserved',
  ) => {
    setTransitioningExpenseId(exp.id)
    try {
      await adminApi.patch(`/admin/ledger/expenses/${exp.id}/status`, {
        status: nextStatus,
        expected_version: exp.version ?? 1,
      })
      setRefreshedConflictExpense((prev) => (prev?.id === exp.id ? null : prev))
      toast.success(`Статус расхода #${exp.id} обновлён: ${nextStatus}`)
      await fetchLedgerData()
    } catch (err: unknown) {
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        toast.warning(
          extractApiError(err, 'Конфликт версии или недопустимый переход статуса. Данные обновлены.'),
        )
        try {
          const singleRes = await adminApi.get<{
            success?: boolean
            expense?: AdminLedgerExpense
          }>(`/admin/ledger/expenses/${exp.id}`)
          const freshExpense = singleRes.data.expense
          if (freshExpense) {
            const activeSettlement = ledgerParamsRef.current.selectedSettlement
            if (activeSettlement === 'all' || activeSettlement === freshExpense.settlement_id) {
              setExpenses((prev) =>
                prev.map((item) => (item.id === freshExpense.id ? freshExpense : item)),
              )
              setRefreshedConflictExpense(freshExpense)
            }
          }
        } catch {
          // Non-fatal; list refresh below still runs
        }
        await fetchLedgerData()
      } else {
        toast.error(extractApiError(err, 'Не удалось обновить статус расхода'))
      }
    } finally {
      setTransitioningExpenseId(null)
    }
  }

  const totalPages = Math.ceil(total / limit)
  const availableCategories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  function openEdit(t: Transaction) {
    setEditingId(t.id)
    setForm({
      type: t.type,
      category: t.category,
      amount: t.amount,
      description: t.description,
      counterparty: t.counterparty || '',
      date: t.date.split('T')[0],
    })
    setModalOpen(true)
  }

  async function handleSave() {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      toast.error('Введите корректную сумму')
      return
    }
    if (!form.description.trim()) {
      toast.error('Введите описание')
      return
    }

    setSaving(true)
    try {
      if (editingId) {
        await adminApi.patch(`/admin/finance/transactions/${editingId}`, form)
        toast.success('Транзакция обновлена')
      } else {
        await adminApi.post('/admin/finance/transactions', form)
        toast.success('Транзакция добавлена')
      }
      setModalOpen(false)
      fetchSummary()
      fetchTransactions()
    } catch (err: unknown) {
      toast.error(extractApiError(err, 'Ошибка сохранения'))
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await adminApi.delete(`/admin/finance/transactions/${deleteId}`)
      toast.success('Транзакция удалена')
      setDeleteId(null)
      fetchSummary()
      fetchTransactions()
    } catch {
      toast.error('Не удалось удалить транзакцию')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display mb-2">Финансы</h1>
          <p className="text-text-secondary text-sm">
            Верифицированный реестр взносов в копейках (FIFO) и операционный журнал транзакций.
          </p>
        </div>
        {activeTab === 'legacy' ? (
          <Button onClick={openCreate}>
            <Plus size={16} />
            Добавить транзакцию
          </Button>
        ) : (
          <Button variant="secondary" size="sm" onClick={fetchLedgerData} disabled={ledgerLoading}>
            Обновить реестр
          </Button>
        )}
      </div>

      {/* Tab Switcher */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('ledger')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'ledger'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
          }`}
        >
          <Coins size={16} />
          Реестр взносов и расходов (Копейки / FIFO)
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('legacy')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'legacy'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
          }`}
        >
          <Wallet size={16} />
          Операционный журнал (Legacy)
        </button>
      </div>

      {activeTab === 'ledger' ? (
        <div className="space-y-8">
          {/* Settlement Scope Selector */}
          <Card padding="sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-text">Область поселения (Settlement Scope)</p>
                <p className="text-xs text-text-muted">
                  Фильтрует сводку, взносы и расходы; создание новых записей привязано к{' '}
                  <code className="text-text">{concreteSettlement}</code>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor="settlement-scope" className="text-xs text-text-secondary shrink-0">
                  Поселение:
                </label>
                <select
                  id="settlement-scope"
                  value={selectedSettlement}
                  onChange={(e) => {
                    setSelectedSettlement(e.target.value)
                    setContribPage(0)
                    setExpensePage(0)
                    setExpMilestoneId('')
                    setRefreshedConflictExpense(null)
                  }}
                  className="px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent"
                >
                  <option value="all">Все поселения (all)</option>
                  {availableSettlements.map((settlement) => (
                    <option key={settlement} value={settlement}>
                      {settlement}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Card>

          {ledgerError && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <div className="flex items-center gap-2 text-amber-400 text-sm">
                <AlertTriangle size={16} />
                <span>{ledgerError}</span>
              </div>
            </Card>
          )}

          {/* KPI Summary Cards: Verified Spendable vs Non-Spendable Modes */}
          {ledgerLoading && (!ledgerSummary || !summaryAligned) ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="animate-spin text-accent" size={24} />
            </div>
          ) : ledgerSummary && summaryAligned ? (
            <div className="space-y-4">
              {(() => {
                const verifiedStats = ledgerSummary.by_ledger_mode?.verified_receipt
                const pledgeStats = ledgerSummary.by_ledger_mode?.pledge
                const legacyStats = ledgerSummary.by_ledger_mode?.legacy_import
                const verifiedReceived =
                  verifiedStats?.received.rubles_str ?? ledgerSummary.totals.received.rubles_str
                const verifiedAvailable =
                  verifiedStats?.available?.rubles_str ?? ledgerSummary.totals.available.rubles_str
                const verifiedReserved =
                  verifiedStats?.reserved?.rubles_str ?? ledgerSummary.totals.reserved.rubles_str
                const verifiedPaid =
                  verifiedStats?.paid?.rubles_str ?? ledgerSummary.totals.paid.rubles_str
                const verifiedCount =
                  verifiedStats?.contributions_count ?? ledgerSummary.totals.contributions_count

                return (
                  <>
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldCheck size={16} className="text-green" />
                        <h3 className="text-sm font-semibold text-text">
                          Проверенные средства (verified_receipt)
                        </h3>
                        <Badge variant="success">Доступно к аллокации</Badge>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                          <p className="text-xs text-text-secondary">Получено (verified_receipt)</p>
                          <p className="text-xl font-bold font-display text-text mt-1">
                            {verifiedReceived} ₽
                          </p>
                          <p className="text-[11px] text-text-muted mt-1">
                            Взносов: {verifiedCount}
                          </p>
                        </Card>
                        <Card>
                          <p className="text-xs text-text-secondary">Доступный остаток (расходуемый)</p>
                          <p className="text-xl font-bold font-display text-green mt-1">
                            {verifiedAvailable} ₽
                          </p>
                        </Card>
                        <Card>
                          <p className="text-xs text-text-secondary">Зарезервировано</p>
                          <p className="text-xl font-bold font-display text-amber-400 mt-1">
                            {verifiedReserved} ₽
                          </p>
                        </Card>
                        <Card>
                          <p className="text-xs text-text-secondary">Оплачено по расходам</p>
                          <p className="text-xl font-bold font-display text-accent mt-1">
                            {verifiedPaid} ₽
                          </p>
                        </Card>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card className="border-amber-500/25 bg-amber-500/5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-amber-400">
                            Обещания (pledge)
                          </span>
                          <Badge variant="warning">Не расходуется</Badge>
                        </div>
                        <p className="text-lg font-bold font-display text-text mt-1">
                          {pledgeStats?.received.rubles_str ?? '0.00'} ₽
                        </p>
                        <p className="text-[11px] text-text-muted mt-1">
                          Записей: {pledgeStats?.contributions_count ?? 0} · Не участвует в доступном остатке и аллокациях расходов.
                        </p>
                      </Card>
                      <Card className="border-border bg-bg-elevated/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-text-secondary">
                            Исторический импорт (legacy_import)
                          </span>
                          <Badge variant="default">Архив · не расходуется</Badge>
                        </div>
                        <p className="text-lg font-bold font-display text-text mt-1">
                          {legacyStats?.received.rubles_str ?? '0.00'} ₽
                        </p>
                        <p className="text-[11px] text-text-muted mt-1">
                          Записей: {legacyStats?.contributions_count ?? 0} · Исторический учёт без доступного остатка для новых трат.
                        </p>
                      </Card>
                    </div>
                  </>
                )
              })()}
            </div>
          ) : null}

          {/* Creation Forms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Record Verified Contribution */}
            <Card>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <ShieldCheck size={18} className="text-green" />
                  <h2 className="text-base font-semibold font-display">
                    Записать верифицированный взнос
                  </h2>
                  <Badge variant="info">{concreteSettlement}</Badge>
                </div>
                <span className="text-[10px] font-mono text-text-muted" title={contribIdempKey}>
                  key: {contribIdempKey.slice(0, 8)}…
                </span>
              </div>

              <form onSubmit={handleRecordContribution} className="space-y-3.5">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Имя вкладчика *"
                    value={contribName}
                    onChange={(e) => setContribName(e.target.value)}
                    placeholder="Иван Петров"
                    required
                  />
                  <Input
                    label="Сумма (₽) *"
                    type="text"
                    inputMode="decimal"
                    value={contribAmountRubles}
                    onChange={(e) => setContribAmountRubles(e.target.value)}
                    placeholder="1000.00"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Назначение (purpose)"
                    value={contribPurpose}
                    onChange={(e) => setContribPurpose(e.target.value)}
                    placeholder="general"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="contrib-legal-right"
                      className="text-sm font-medium text-text-secondary"
                    >
                      Тип права
                    </label>
                    <select
                      id="contrib-legal-right"
                      value={contribLegalRight}
                      onChange={(e) => setContribLegalRight(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent"
                    >
                      {LEGAL_RIGHT_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Класс пая (share_class, опц.)"
                    value={contribShareClass}
                    onChange={(e) => setContribShareClass(e.target.value)}
                    placeholder="class_a"
                  />
                  <Input
                    label="User ID (опц.)"
                    type="number"
                    min="1"
                    value={contribUserId}
                    onChange={(e) => setContribUserId(e.target.value)}
                    placeholder="Например: 42"
                  />
                </div>

                <div className="flex justify-end pt-1">
                  <Button type="submit" loading={savingContrib} size="sm">
                    <Plus size={15} />
                    Записать взнос
                  </Button>
                </div>
              </form>
            </Card>

            {/* Create & Allocate Expense */}
            <Card>
              <div className="flex items-center justify-between gap-2 mb-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <ArrowDownRight size={18} className="text-accent" />
                  <h2 className="text-base font-semibold font-display">
                    Создать и аллоцировать расход
                  </h2>
                  <Badge variant="info">{concreteSettlement}</Badge>
                </div>
                <span className="text-[10px] font-mono text-text-muted" title={expIdempKey}>
                  key: {expIdempKey.slice(0, 8)}…
                </span>
              </div>

              <form onSubmit={handleCreateExpense} className="space-y-3.5">
                <Input
                  label="Название расхода *"
                  value={expTitle}
                  onChange={(e) => setExpTitle(e.target.value)}
                  placeholder="Закупка солнечных инверторов"
                  required
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="exp-category"
                      className="text-sm font-medium text-text-secondary"
                    >
                      Категория
                    </label>
                    <select
                      id="exp-category"
                      value={expCategory}
                      onChange={(e) => setExpCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent"
                    >
                      {EXPENSE_CATEGORIES.map((c) => (
                        <option key={c.value} value={c.value}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Input
                    label="Сумма (₽) *"
                    type="text"
                    inputMode="decimal"
                    value={expAmountRubles}
                    onChange={(e) => setExpAmountRubles(e.target.value)}
                    placeholder="5000.00"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Назначение (purpose)"
                    value={expPurpose}
                    onChange={(e) => setExpPurpose(e.target.value)}
                    placeholder="general"
                  />
                  <div className="flex flex-col gap-1.5">
                    <label
                      htmlFor="exp-allocation-rule"
                      className="text-sm font-medium text-text-secondary"
                    >
                      Правило аллокации
                    </label>
                    <select
                      id="exp-allocation-rule"
                      value={expAllocationRule}
                      onChange={(e) =>
                        setExpAllocationRule(e.target.value as 'fifo' | 'proportional')
                      }
                      className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="fifo">FIFO (по очереди)</option>
                      <option value="proportional">Пропорционально (Hamilton)</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor="exp-milestone"
                    className="text-sm font-medium text-text-secondary"
                  >
                    Этап стройки (milestone, опционально)
                  </label>
                  <select
                    id="exp-milestone"
                    value={expMilestoneId}
                    onChange={(e) => setExpMilestoneId(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent"
                  >
                    <option value="">Без привязки к этапу</option>
                    {milestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        #{m.id} · {m.code} — {m.title}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-text-secondary cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={expMarkPaid}
                    onChange={(e) => setExpMarkPaid(e.target.checked)}
                    className="w-4 h-4 rounded border-border accent-accent"
                  />
                  <span>Сразу отметить как оплаченный (mark_paid)</span>
                </label>

                <div className="flex justify-end pt-1">
                  <Button type="submit" loading={savingExpense} size="sm">
                    <Plus size={15} />
                    Провести расход
                  </Button>
                </div>
              </form>
            </Card>
          </div>

          {/* Expenses Table */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold font-display">
                Расходы реестра ({expensesAligned ? expenseTotal : 0})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {EXPENSE_STATUS_FILTERS.map((opt) => (
                  <button
                    key={opt.value || 'all'}
                    type="button"
                    onClick={() => {
                      setExpenseStatusFilter(opt.value)
                      setExpensePage(0)
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      expenseStatusFilter === opt.value
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-text-secondary hover:text-text hover:bg-bg-elevated border border-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {refreshedConflictExpense && (
              <div className="mb-4 p-3 rounded-lg border border-amber-500/30 bg-amber-500/5 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <span className="font-semibold text-amber-400">
                    Актуальное состояние расхода #{refreshedConflictExpense.id}:
                  </span>{' '}
                  <span className="text-text">{refreshedConflictExpense.title}</span> — статус{' '}
                  <code>{refreshedConflictExpense.status}</code>, версия{' '}
                  <code>v{refreshedConflictExpense.version ?? 1}</code>, поселение{' '}
                  <code>{refreshedConflictExpense.settlement_id}</code>.
                </div>
                <button
                  type="button"
                  onClick={() => setRefreshedConflictExpense(null)}
                  className="text-text-muted hover:text-text shrink-0"
                >
                  Скрыть
                </button>
              </div>
            )}

            {!expensesAligned ? (
              ledgerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-accent" size={20} />
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Не удалось загрузить расходы для выбранного поселения и фильтра.
                </p>
              )
            ) : expenses.length === 0 ? (
              <p className="text-sm text-text-muted">Расходов по выбранному фильтру нет.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left border-collapse">
                  <thead>
                    <tr className="border-b border-border text-xs text-text-muted">
                      <th className="py-2 pr-3">ID / Название</th>
                      <th className="py-2 px-3">Сумма</th>
                      <th className="py-2 px-3">Статус</th>
                      <th className="py-2 px-3">Финансы / Спор</th>
                      <th className="py-2 px-3">Версия</th>
                      <th className="py-2 pl-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {expenses.map((exp) => {
                      const statusMeta = EXPENSE_STATUS_BADGE[exp.status] ?? {
                        label: exp.status,
                        variant: 'default' as const,
                      }
                      const financialStatus = exp.financial_status ?? (
                        exp.status === 'disputed' ? 'reserved' : exp.status
                      )
                      const disputeStatus = exp.dispute_status ?? (
                        exp.status === 'disputed' ? 'open' : 'none'
                      )
                      const isDisputed = disputeStatus === 'open' || exp.status === 'disputed'
                      const version = exp.version ?? 1
                      const busy = transitioningExpenseId === exp.id || ledgerLoading || !expensesAligned

                      return (
                        <tr key={exp.id} className="align-top">
                          <td className="py-3 pr-3">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-medium text-text">
                                #{exp.id} · {exp.title}
                              </p>
                              <Badge variant="info">{exp.settlement_id}</Badge>
                              {exp.allocation_ledger_modes?.map((mode) => (
                                <Badge key={mode} variant="default">
                                  {mode}
                                </Badge>
                              ))}
                            </div>
                            <p className="text-xs text-text-muted">
                              {CATEGORY_LABELS[exp.category] || exp.category} · {exp.purpose} ·{' '}
                              {exp.allocation_rule}
                            </p>
                          </td>
                          <td className="py-3 px-3 font-mono font-semibold text-accent whitespace-nowrap">
                            {exp.amount.rubles_str} ₽
                          </td>
                          <td className="py-3 px-3">
                            <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                          </td>
                          <td className="py-3 px-3 text-xs text-text-secondary whitespace-nowrap">
                            <div>fin: <code>{financialStatus}</code></div>
                            <div>dispute: <code>{disputeStatus}</code></div>
                          </td>
                          <td className="py-3 px-3 text-xs font-mono text-text-muted">
                            v{version}
                          </td>
                          <td className="py-3 pl-3">
                            <div className="flex flex-wrap justify-end gap-1.5">
                              {isDisputed ? (
                                <>
                                  {financialStatus === 'reserved' && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="primary"
                                        disabled={busy}
                                        onClick={() => handleExpenseTransition(exp, 'paid')}
                                      >
                                        <CheckCircle2 size={13} />
                                        Оплатить
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => handleExpenseTransition(exp, 'cancelled')}
                                      >
                                        <XCircle size={13} />
                                        Отменить
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => handleExpenseTransition(exp, 'reserved')}
                                      >
                                        <RotateCcw size={13} />
                                        Вернуть в резерв
                                      </Button>
                                    </>
                                  )}
                                  {financialStatus === 'paid' && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="primary"
                                      disabled={busy}
                                      onClick={() => handleExpenseTransition(exp, 'paid')}
                                    >
                                      <CheckCircle2 size={13} />
                                      Закрыть спор (оплачен)
                                    </Button>
                                  )}
                                  {financialStatus === 'cancelled' && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      disabled={busy}
                                      onClick={() => handleExpenseTransition(exp, 'cancelled')}
                                    >
                                      <XCircle size={13} />
                                      Закрыть спор (отменён)
                                    </Button>
                                  )}
                                </>
                              ) : (
                                <>
                                  {financialStatus === 'reserved' && (
                                    <>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="primary"
                                        disabled={busy}
                                        onClick={() => handleExpenseTransition(exp, 'paid')}
                                      >
                                        <CheckCircle2 size={13} />
                                        Оплатить
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={busy}
                                        onClick={() => handleExpenseTransition(exp, 'cancelled')}
                                      >
                                        <XCircle size={13} />
                                        Отменить
                                      </Button>
                                    </>
                                  )}
                                  {exp.status !== 'cancelled' && (
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="danger"
                                      disabled={busy}
                                      onClick={() => handleExpenseTransition(exp, 'disputed')}
                                    >
                                      <AlertTriangle size={13} />
                                      Оспорить
                                    </Button>
                                  )}
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {expensesAligned && (expensePage > 0 || expenseHasMore || expenseTotal > LEDGER_PAGE_SIZE) && (
              <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
                <span className="text-xs text-text-muted">
                  Страница {expensePage + 1} · Всего: {expenseTotal}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={expensePage === 0 || ledgerLoading}
                    onClick={() => setExpensePage((p) => Math.max(0, p - 1))}
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!expenseHasMore || ledgerLoading}
                    onClick={() => setExpensePage((p) => p + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Contributions List */}
          <Card>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-semibold font-display">
                Взносы в реестре ({contribsAligned ? contribTotal : 0})
              </h2>
              <div className="flex flex-wrap gap-1.5">
                {CONTRIB_MODE_FILTERS.map((opt) => (
                  <button
                    key={opt.value || 'all'}
                    type="button"
                    onClick={() => {
                      setContribModeFilter(opt.value)
                      setContribPage(0)
                    }}
                    className={`px-2.5 py-1 text-xs font-medium rounded-lg transition-colors ${
                      contribModeFilter === opt.value
                        ? 'bg-accent/15 text-accent border border-accent/30'
                        : 'text-text-secondary hover:text-text hover:bg-bg-elevated border border-border'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            {!contribsAligned ? (
              ledgerLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="animate-spin text-accent" size={20} />
                </div>
              ) : (
                <p className="text-sm text-text-muted">
                  Не удалось загрузить взносы для выбранного поселения и фильтра.
                </p>
              )
            ) : contributions.length === 0 ? (
              <p className="text-sm text-text-muted">Взносов по выбранному фильтру нет.</p>
            ) : (
              <div className="space-y-2.5">
                {contributions.map((c) => {
                  const modeMeta = LEDGER_MODE_META[c.ledger_mode] ?? {
                    label: c.ledger_mode,
                    variant: 'default' as const,
                  }
                  return (
                    <div
                      key={c.id}
                      className="p-3 rounded-lg bg-bg-elevated/60 border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-text">
                            #{c.id} · {c.contributor_name}
                          </span>
                          <Badge variant="info">{c.settlement_id}</Badge>
                          <Badge variant={modeMeta.variant}>{modeMeta.label}</Badge>
                          <Badge variant="default">{c.status}</Badge>
                          <Badge variant="info">{c.legal_right_type}</Badge>
                          {c.share_class && <Badge variant="default">{c.share_class}</Badge>}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          Назначение: {c.purpose}
                          {c.user_id ? ` · User #${c.user_id}` : ''} ·{' '}
                          {new Date(c.created_at).toLocaleDateString('ru-RU')}
                        </p>
                      </div>
                      <div className="text-xs text-text-secondary flex flex-wrap gap-3 shrink-0">
                        <span>
                          Получено: <strong className="text-text">{c.received.rubles_str} ₽</strong>
                        </span>
                        <span>
                          Доступно:{' '}
                          <strong className={c.ledger_mode === 'verified_receipt' ? 'text-green' : 'text-text-muted'}>
                            {c.available.rubles_str} ₽
                          </strong>
                        </span>
                        <span>Резерв: {c.reserved.rubles_str} ₽</span>
                        <span>Оплачено: {c.paid.rubles_str} ₽</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
            {contribsAligned && (contribPage > 0 || contribHasMore || contribTotal > LEDGER_PAGE_SIZE) && (
              <div className="flex items-center justify-between gap-3 pt-4 mt-4 border-t border-border">
                <span className="text-xs text-text-muted">
                  Страница {contribPage + 1} · Всего: {contribTotal}
                </span>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={contribPage === 0 || ledgerLoading}
                    onClick={() => setContribPage((p) => Math.max(0, p - 1))}
                  >
                    Назад
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={!contribHasMore || ledgerLoading}
                    onClick={() => setContribPage((p) => p + 1)}
                  >
                    Вперёд
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Summary cards */}
          {summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-green/10 flex items-center justify-center">
                    <TrendingUp className="text-green" size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-green">
                      {formatRubles(summary.totalIncome)}
                    </p>
                    <p className="text-xs text-text-secondary">Доходы</p>
                  </div>
                </div>
              </Card>
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
                    <TrendingDown className="text-accent" size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display text-accent">
                      {formatRubles(summary.totalExpenses)}
                    </p>
                    <p className="text-xs text-text-secondary">Расходы</p>
                  </div>
                </div>
              </Card>
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-400/10 flex items-center justify-center">
                    <Wallet className="text-blue-400" size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">
                      {formatRubles(summary.balance)}
                    </p>
                    <p className="text-xs text-text-secondary">Баланс</p>
                  </div>
                </div>
              </Card>
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-400/10 flex items-center justify-center">
                    <CheckCircle2 className="text-purple-400" size={18} />
                  </div>
                  <div>
                    <p className="text-lg font-bold font-display">
                      {summary.transactionCount}
                    </p>
                    <p className="text-xs text-text-secondary">Транзакций</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-text-muted" size={24} />
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex gap-2">
              {(['all', 'income', 'expense'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => {
                    setFilter(f)
                    setPage(0)
                  }}
                  className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    filter === f
                      ? 'bg-accent/10 text-accent'
                      : 'text-text-secondary hover:text-text hover:bg-bg-card'
                  }`}
                >
                  {f === 'all' ? 'Все' : f === 'income' ? 'Доходы' : 'Расходы'}
                </button>
              ))}
            </div>
            <div className="relative flex-1 max-w-xs">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Поиск..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value)
                  setPage(0)
                }}
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent text-sm transition-colors"
              />
            </div>
          </div>

          {/* Transactions table */}
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="animate-spin text-text-muted" size={24} />
            </div>
          ) : transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((t) => (
                <Card key={t.id} padding="sm" className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        t.type === 'income' ? 'bg-green/10' : 'bg-accent/10'
                      }`}
                    >
                      {t.type === 'income' ? (
                        <ArrowUpRight className="text-green" size={16} />
                      ) : (
                        <ArrowDownRight className="text-accent" size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text truncate">{t.description}</p>
                        {t.is_verified && (
                          <CheckCircle2 size={14} className="text-green flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                        <span>{new Date(t.date).toLocaleDateString('ru-RU')}</span>
                        <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                          {CATEGORY_LABELS[t.category] || t.category}
                        </span>
                        {t.counterparty && (
                          <span className="text-text-muted truncate max-w-[150px]">
                            {t.counterparty}
                          </span>
                        )}
                        {t.source === 'bank_import' && (
                          <span className="text-text-muted">банк</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    <p
                      className={`text-sm font-bold font-display ${
                        t.type === 'income' ? 'text-green' : 'text-accent'
                      }`}
                    >
                      {t.type === 'income' ? '+' : '-'}
                      {formatRubles(parseFloat(t.amount))}
                    </p>
                    <button
                      onClick={() => openEdit(t)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-bg-elevated transition-colors"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeleteId(t.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-red-400 hover:bg-red-400/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <div className="text-center py-8">
                <Wallet className="mx-auto text-text-muted mb-3" size={32} />
                <p className="text-text-secondary text-sm">Нет транзакций</p>
                <p className="text-text-muted text-xs mt-1">
                  Добавьте первую транзакцию, чтобы начать отслеживать финансы
                </p>
              </div>
            </Card>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Назад
              </button>
              <span className="text-sm text-text-muted">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Далее
              </button>
            </div>
          )}

          {/* Add/Edit Modal */}
          <Modal
            open={modalOpen}
            onOpenChange={setModalOpen}
            title={editingId ? 'Редактировать транзакцию' : 'Новая транзакция'}
          >
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['expense', 'income'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      setForm((f) => ({
                        ...f,
                        type: t,
                        category: t === 'income' ? 'donation' : 'legal',
                      }))
                    }}
                    className={`flex-1 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                      form.type === t
                        ? t === 'income'
                          ? 'bg-green/10 text-green border border-green/30'
                          : 'bg-accent/10 text-accent border border-accent/30'
                        : 'bg-bg-elevated text-text-secondary border border-transparent'
                    }`}
                  >
                    {t === 'income' ? 'Доход' : 'Расход'}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-secondary">Категория</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text focus:outline-none focus:border-accent text-sm transition-colors"
                >
                  {availableCategories.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="Сумма (₽)"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
              />

              <Input
                label="Дата"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
              />

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-medium text-text-secondary">Описание</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  placeholder="Описание транзакции..."
                  rows={2}
                  className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text placeholder:text-text-muted focus:outline-none focus:border-accent text-sm transition-colors resize-vertical"
                />
              </div>

              <Input
                label="Контрагент (не виден пользователям)"
                value={form.counterparty}
                onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))}
                placeholder="Название организации или ФИО"
              />

              <div className="flex gap-3 pt-2">
                <Button onClick={handleSave} loading={saving} className="flex-1">
                  {editingId ? 'Сохранить' : 'Добавить'}
                </Button>
                <Button variant="secondary" onClick={() => setModalOpen(false)}>
                  Отмена
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete confirmation modal */}
          <Modal
            open={deleteId !== null}
            onOpenChange={(open) => {
              if (!open) setDeleteId(null)
            }}
            title="Удалить транзакцию?"
            description="Это действие нельзя отменить."
          >
            <div className="flex gap-3 pt-2">
              <Button variant="danger" onClick={handleDelete} loading={deleting} className="flex-1">
                Удалить
              </Button>
              <Button variant="secondary" onClick={() => setDeleteId(null)}>
                Отмена
              </Button>
            </div>
          </Modal>
        </div>
      )}
    </div>
  )
}
