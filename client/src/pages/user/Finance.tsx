import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Hammer,
  Receipt,
  MapPin,
  ExternalLink,
  Image as ImageIcon,
  Shield,
  Coins,
  AlertCircle,
} from 'lucide-react'
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'
import api from '@/services/api'
import Card from '@/components/ui/Card'
import Badge from '@/components/ui/Badge'
import { SkeletonCard, SkeletonTable } from '@/components/ui/Skeleton'
import {
  extractApiError,
  safeExternalUrl,
  type ConstructionMilestone,
  type MyLedgerData,
  type PublicLedgerSummary,
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
  date: string
  is_verified: boolean
}

type FinanceTab = 'overview' | 'my-ledger' | 'construction'

// Category keys for i18n lookup
const CATEGORY_KEYS = [
  'donation', 'grant', 'other_income', 'legal', 'platform',
  'operations', 'equipment', 'land', 'reserve', 'ai_tools', 'other_expense',
] as const

const CATEGORY_COLORS: Record<string, string> = {
  legal: '#3b82f6',
  platform: '#8b5cf6',
  operations: '#f59e0b',
  equipment: '#6b7280',
  land: '#4a7c59',
  reserve: '#eab308',
  ai_tools: '#06b6d4',
  other_expense: '#9ca3af',
  donation: '#22c55e',
  grant: '#14b8a6',
  other_income: '#a3e635',
}

const LEGAL_RIGHT_LABELS: Record<string, string> = {
  observer_trace: 'Наблюдательный след (observer_trace)',
  cooperative_share: 'Кооперативный пай (cooperative_share)',
  direct_fraction: 'Прямая доля (direct_fraction)',
}

const CONTRIBUTION_STATUS_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'info' }
> = {
  unallocated: { label: 'Свободен', variant: 'info' },
  reserved: { label: 'Зарезервирован', variant: 'warning' },
  partially_allocated: { label: 'Частично распределён', variant: 'warning' },
  allocated: { label: 'Полностью освоен', variant: 'success' },
  refunded: { label: 'Возвращён', variant: 'default' },
}

const MILESTONE_STATUS_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'success' | 'warning' | 'info' }
> = {
  planned: { label: 'Запланирован', variant: 'default' },
  in_progress: { label: 'В работе', variant: 'warning' },
  completed: { label: 'Выполнен', variant: 'success' },
}

function formatRubles(amount: number): string {
  return Math.round((amount * 100) / 100).toLocaleString('ru-RU') + ' ₽'
}

function calcProgressPct(actual: number, planned: number): number {
  if (!planned || planned <= 0) return 0
  return Math.min(100, Math.max(0, Math.round((actual / planned) * 100)))
}

function calcKopeckPct(spentStr: string, budgetStr: string): number {
  try {
    const spent = BigInt(spentStr)
    const budget = BigInt(budgetStr)
    if (budget <= 0n) return 0
    const pct = Number((spent * 100n) / budget)
    return Math.min(100, Math.max(0, pct))
  } catch {
    return 0
  }
}

export default function Finance() {
  const { t } = useTranslation()

  const getCategoryLabel = (category: string): string => {
    if (CATEGORY_KEYS.includes(category as (typeof CATEGORY_KEYS)[number])) {
      return t(`finance.categories.${category}`)
    }
    return category
  }

  const [activeTab, setActiveTab] = useState<FinanceTab>('overview')
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const limit = 20

  const [myLedger, setMyLedger] = useState<MyLedgerData | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(true)
  const [publicLedger, setPublicLedger] = useState<PublicLedgerSummary | null>(null)
  const [publicLedgerError, setPublicLedgerError] = useState<string | null>(null)
  const [publicLedgerLoading, setPublicLedgerLoading] = useState(true)
  const [milestones, setMilestones] = useState<ConstructionMilestone[]>([])
  const [milestonesLoading, setMilestonesLoading] = useState(true)

  useEffect(() => {
    async function fetchSummary() {
      try {
        const res = await api.get('/user/finance/summary')
        setSummary(res.data.data)
      } catch {
        // Non-critical
      }
    }
    fetchSummary()
  }, [])

  useEffect(() => {
    async function fetchTransactions() {
      try {
        const params: Record<string, string | number> = { limit, offset: page * limit }
        if (filter !== 'all') params.type = filter
        const res = await api.get('/user/finance/transactions', { params })
        setTransactions(res.data.data ?? [])
        setTotal(res.data.total ?? 0)
      } catch {
        // Non-critical
      } finally {
        setLoading(false)
      }
    }
    fetchTransactions()
  }, [filter, page])

  useEffect(() => {
    let cancelled = false

    async function fetchCoreLedgerAndConstruction() {
      const [ledgerRes, publicSummaryRes, milestonesRes] = await Promise.allSettled([
        api.get<{ success: boolean } & MyLedgerData>('/ledger/my'),
        api.get<{ success: boolean } & PublicLedgerSummary>('/public/ledger/summary'),
        api.get<{ success: boolean; milestones: ConstructionMilestone[] }>(
          '/public/construction/milestones',
        ),
      ])

      if (cancelled) return

      if (ledgerRes.status === 'fulfilled') {
        setMyLedger({
          totals: ledgerRes.value.data.totals,
          contributions: ledgerRes.value.data.contributions ?? [],
        })
      }
      setLedgerLoading(false)

      if (publicSummaryRes.status === 'fulfilled') {
        setPublicLedger(publicSummaryRes.value.data)
        setPublicLedgerError(null)
      } else {
        setPublicLedgerError(
          extractApiError(publicSummaryRes.reason, 'Не удалось загрузить верифицированный реестр'),
        )
      }
      setPublicLedgerLoading(false)

      if (milestonesRes.status === 'fulfilled') {
        setMilestones(milestonesRes.value.data.milestones ?? [])
      }
      setMilestonesLoading(false)
    }

    fetchCoreLedgerAndConstruction()
    return () => {
      cancelled = true
    }
  }, [])

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">{t('finance.title')}</h1>
        <p className="text-text-secondary text-sm">
          {t('finance.subtitle')}
        </p>
        <p className="text-text-muted text-xs mt-1">
          {t('finance.dataNote')}
        </p>
      </div>

      {/* Section Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">
        <button
          type="button"
          onClick={() => setActiveTab('overview')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'overview'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
          }`}
        >
          <Wallet size={16} />
          Сводка и операции
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('my-ledger')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'my-ledger'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
          }`}
        >
          <Coins size={16} />
          Мои взносы и расходы
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('construction')}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === 'construction'
              ? 'bg-accent/15 text-accent border border-accent/30'
              : 'text-text-secondary hover:text-text hover:bg-bg-card border border-transparent'
          }`}
        >
          <Hammer size={16} />
          Панель стройки
        </button>
      </div>

      {/* Tab 1: Existing Settlement Summary & Transactions */}
      {activeTab === 'overview' && (
        <div className="space-y-8">
          {/* Verified Kopeck Ledger (FIFO) vs Legacy Operational Journal Banner */}
          <Card variant="highlighted" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <Shield size={18} className="text-accent" />
                <h2 className="text-base font-semibold font-display text-text">
                  Верифицированный реестр в копейках (FIFO)
                </h2>
                <Badge variant="info">Прослеживаемый контур</Badge>
              </div>
              {publicLedger && (
                <span className="text-xs text-text-muted">
                  Взносов в реестре: {publicLedger.totals.contributions_count}
                </span>
              )}
            </div>

            <p className="text-xs text-text-secondary leading-relaxed">
              Ниже показаны точные итоги{' '}
              <strong className="text-text">Верифицированного реестра в копейках (FIFO)</strong> —
              каждая копейка взноса связана с конкретным расходом и этапом стройки.{' '}
              <span className="text-text-muted">
                Операционный журнал (legacy transactions) ниже ведётся как отдельный контур учёта
                и не суммируется с копеечным реестром.
              </span>
            </p>

            {publicLedgerLoading ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
                <SkeletonCard />
              </div>
            ) : publicLedgerError ? (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400 flex items-center gap-2">
                <AlertCircle size={14} />
                <span>{publicLedgerError}</span>
              </div>
            ) : publicLedger ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 rounded-lg bg-bg-elevated/60 border border-border">
                  <p className="text-xs text-text-muted">Получено</p>
                  <p className="text-base font-bold font-display text-text mt-0.5">
                    {publicLedger.totals.received.rubles_str} ₽
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bg-elevated/60 border border-border">
                  <p className="text-xs text-text-muted">Доступно</p>
                  <p className="text-base font-bold font-display text-green mt-0.5">
                    {publicLedger.totals.available.rubles_str} ₽
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bg-elevated/60 border border-border">
                  <p className="text-xs text-text-muted">В резерве</p>
                  <p className="text-base font-bold font-display text-amber-400 mt-0.5">
                    {publicLedger.totals.reserved.rubles_str} ₽
                  </p>
                </div>
                <div className="p-3 rounded-lg bg-bg-elevated/60 border border-border">
                  <p className="text-xs text-text-muted">Оплачено</p>
                  <p className="text-base font-bold font-display text-accent mt-0.5">
                    {publicLedger.totals.paid.rubles_str} ₽
                  </p>
                </div>
              </div>
            ) : null}
          </Card>

          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold font-display text-text">
              Операционный журнал (legacy transactions)
            </h2>
          </div>

          {/* Summary cards */}
          {summary ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center">
                    <TrendingUp className="text-green" size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display text-green">
                      {formatRubles(summary.totalIncome)}
                    </p>
                    <p className="text-xs text-text-secondary">{t('finance.summary.income')}</p>
                  </div>
                </div>
              </Card>
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                    <TrendingDown className="text-accent" size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display text-accent">
                      {formatRubles(summary.totalExpenses)}
                    </p>
                    <p className="text-xs text-text-secondary">{t('finance.summary.expenses')}</p>
                  </div>
                </div>
              </Card>
              <Card className="hover:border-border-hover transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-blue-400/10 flex items-center justify-center">
                    <Wallet className="text-blue-400" size={20} />
                  </div>
                  <div>
                    <p className="text-2xl font-bold font-display">
                      {formatRubles(summary.balance)}
                    </p>
                    <p className="text-xs text-text-secondary">{t('finance.summary.balance')}</p>
                  </div>
                </div>
              </Card>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          )}

          {/* Charts */}
          {summary && summary.expenseBreakdown.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card>
                <h3 className="text-sm font-semibold font-display mb-4">
                  {t('finance.charts.expensesByCategory')}
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={summary.expenseBreakdown.map((e) => ({
                        name: getCategoryLabel(e.category),
                        value: e.total,
                        fill: CATEGORY_COLORS[e.category] || '#6b7280',
                      }))}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {summary.expenseBreakdown.map((e, i) => (
                        <Cell key={i} fill={CATEGORY_COLORS[e.category] || '#6b7280'} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        background: '#141414',
                        border: '1px solid #222',
                        borderRadius: 8,
                      }}
                      labelStyle={{ color: '#e0e0e0' }}
                      formatter={(value) => formatRubles(value as number)}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-3 mt-2">
                  {summary.expenseBreakdown.map((e) => (
                    <div
                      key={e.category}
                      className="flex items-center gap-1.5 text-xs text-text-secondary"
                    >
                      <div
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ background: CATEGORY_COLORS[e.category] || '#6b7280' }}
                      />
                      {getCategoryLabel(e.category)}
                    </div>
                  ))}
                </div>
              </Card>

              <Card>
                <h3 className="text-sm font-semibold font-display mb-4">
                  {t('finance.charts.overview')}
                </h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart
                    data={[
                      { name: t('finance.charts.incomeBar'), amount: summary.totalIncome },
                      { name: t('finance.charts.expensesBar'), amount: summary.totalExpenses },
                    ]}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                    <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 12 }} />
                    <YAxis tick={{ fill: '#888', fontSize: 12 }} />
                    <Tooltip
                      contentStyle={{
                        background: '#141414',
                        border: '1px solid #222',
                        borderRadius: 8,
                      }}
                      formatter={(value) => formatRubles(value as number)}
                    />
                    <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
                      <Cell fill="#4a7c59" />
                      <Cell fill="#c23616" />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card>
            </div>
          )}

          {/* Filter tabs */}
          <div className="flex gap-2">
            {(['all', 'income', 'expense'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setLoading(true)
                  setFilter(f)
                  setPage(0)
                }}
                className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                  filter === f
                    ? 'bg-accent/10 text-accent'
                    : 'text-text-secondary hover:text-text hover:bg-bg-card'
                }`}
              >
                {f === 'all'
                  ? t('finance.filters.all')
                  : f === 'income'
                    ? t('finance.filters.income')
                    : t('finance.filters.expenses')}
              </button>
            ))}
          </div>

          {/* Transactions list */}
          {loading ? (
            <SkeletonTable rows={10} />
          ) : transactions.length > 0 ? (
            <div className="space-y-2">
              {transactions.map((tx) => (
                <Card key={tx.id} padding="sm" className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        tx.type === 'income' ? 'bg-green/10' : 'bg-accent/10'
                      }`}
                    >
                      {tx.type === 'income' ? (
                        <ArrowUpRight className="text-green" size={16} />
                      ) : (
                        <ArrowDownRight className="text-accent" size={16} />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-text truncate">{tx.description}</p>
                        {tx.is_verified && (
                          <CheckCircle2 size={14} className="text-green flex-shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-text-muted mt-0.5">
                        <span>{new Date(tx.date).toLocaleDateString('ru-RU')}</span>
                        <span className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-secondary">
                          {getCategoryLabel(tx.category)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <p
                    className={`text-sm font-bold font-display flex-shrink-0 ${
                      tx.type === 'income' ? 'text-green' : 'text-accent'
                    }`}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatRubles(parseFloat(tx.amount))}
                  </p>
                </Card>
              ))}
            </div>
          ) : null}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  setPage((p) => Math.max(0, p - 1))
                }}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.actions.back')}
              </button>
              <span className="text-sm text-text-muted">
                {page + 1} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => {
                  setLoading(true)
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg bg-bg-card border border-border text-text-secondary hover:text-text disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t('common.actions.forward')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Personal Contributions & Linked Expense Allocations */}
      {activeTab === 'my-ledger' && (
        <div className="space-y-6">
          {ledgerLoading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : !myLedger ? (
            <Card>
              <p className="text-sm text-text-secondary">
                Не удалось загрузить персональный реестр взносов.
              </p>
            </Card>
          ) : (
            <>
              {/* Personal Totals */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <Card padding="sm">
                  <p className="text-xs text-text-muted">Получено</p>
                  <p className="text-lg font-bold font-display text-text mt-1">
                    {myLedger.totals.received.rubles_str} ₽
                  </p>
                </Card>
                <Card padding="sm">
                  <p className="text-xs text-text-muted">Доступно</p>
                  <p className="text-lg font-bold font-display text-green mt-1">
                    {myLedger.totals.available.rubles_str} ₽
                  </p>
                </Card>
                <Card padding="sm">
                  <p className="text-xs text-text-muted">Зарезервировано</p>
                  <p className="text-lg font-bold font-display text-amber-400 mt-1">
                    {myLedger.totals.reserved.rubles_str} ₽
                  </p>
                </Card>
                <Card padding="sm">
                  <p className="text-xs text-text-muted">Оплачено в расходы</p>
                  <p className="text-lg font-bold font-display text-accent mt-1">
                    {myLedger.totals.paid.rubles_str} ₽
                  </p>
                </Card>
                <Card padding="sm">
                  <p className="text-xs text-text-muted">Возвращено</p>
                  <p className="text-lg font-bold font-display text-text-secondary mt-1">
                    {myLedger.totals.refunded.rubles_str} ₽
                  </p>
                </Card>
              </div>

              {/* Contributions & Linked Expense Allocations */}
              {myLedger.contributions.length === 0 ? (
                <Card>
                  <p className="text-sm text-text-secondary">
                    У вас пока нет зафиксированных взносов в реестре сохранения (даже от 100 ₽
                    наблюдателя). После зачисления здесь появится полная трассировка до конкретных
                    активов и чеков.
                  </p>
                </Card>
              ) : (
                <div className="space-y-4">
                  {myLedger.contributions.map((contrib) => {
                    const statusMeta = CONTRIBUTION_STATUS_LABELS[contrib.status] ?? {
                      label: contrib.status,
                      variant: 'default' as const,
                    }
                    return (
                      <Card key={contrib.id} className="space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-base font-semibold font-display text-text">
                                Взнос #{contrib.id} · {contrib.received.rubles_str} ₽
                              </span>
                              <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                              <Badge variant="default">
                                <Shield size={12} />{' '}
                                {LEGAL_RIGHT_LABELS[contrib.legal_right_type] ??
                                  contrib.legal_right_type}
                              </Badge>
                            </div>
                            <p className="text-xs text-text-muted">
                              {new Date(contrib.created_at).toLocaleDateString('ru-RU')} · Назначение:{' '}
                              {contrib.purpose}
                              {contrib.share_class ? ` · Пай: ${contrib.share_class}` : ''}
                            </p>
                          </div>

                          <div className="flex flex-wrap gap-3 text-xs text-text-secondary">
                            <span>Доступно: {contrib.available.rubles_str} ₽</span>
                            <span>Резерв: {contrib.reserved.rubles_str} ₽</span>
                            <span>Оплачено: {contrib.paid.rubles_str} ₽</span>
                          </div>
                        </div>

                        {contrib.note && (
                          <p className="text-xs text-text-secondary">{contrib.note}</p>
                        )}

                        {contrib.allocations.length === 0 ? (
                          <p className="text-xs text-text-muted pt-2 border-t border-border">
                            Средства пока не распределены на конкретный расход — находятся на
                            свободном остатке.
                          </p>
                        ) : (
                          <div className="space-y-3 pt-3 border-t border-border">
                            <p className="text-xs font-medium text-text-secondary">
                              Связанные расходы и активы ({contrib.allocations.length}):
                            </p>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {contrib.allocations.map((alloc) => {
                                const receiptHref = safeExternalUrl(alloc.receipt_url)
                                const photoHref = safeExternalUrl(alloc.photo_url)
                                return (
                                  <div
                                    key={alloc.allocation_id}
                                    className="p-3.5 rounded-lg bg-bg-elevated/60 border border-border space-y-2"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="text-sm font-semibold text-text">
                                          {alloc.asset_name || alloc.expense_title}
                                        </p>
                                        <p className="text-xs text-text-muted">
                                          {alloc.expense_title} · {getCategoryLabel(alloc.expense_category)}
                                        </p>
                                      </div>
                                      <span className="text-xs font-bold font-display text-accent shrink-0">
                                        {alloc.allocated.rubles_str} ₽
                                      </span>
                                    </div>

                                    <div className="flex flex-wrap gap-1.5">
                                      <Badge variant="info">{alloc.financing_share_label}</Badge>
                                      <Badge variant="default">
                                        {LEGAL_RIGHT_LABELS[alloc.legal_right_type] ??
                                          alloc.legal_right_type}
                                      </Badge>
                                    </div>

                                    {alloc.asset_location && (
                                      <p className="text-xs text-text-secondary flex items-center gap-1">
                                        <MapPin size={12} className="text-text-muted shrink-0" />
                                        {alloc.asset_location}
                                      </p>
                                    )}

                                    <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                                      <span className="text-text-muted">
                                        Чек расхода: {alloc.expense_total.rubles_str} ₽ (
                                        {alloc.expense_status})
                                      </span>
                                      {receiptHref && (
                                        <a
                                          href={receiptHref}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-accent hover:underline"
                                        >
                                          <Receipt size={12} /> Чек <ExternalLink size={11} />
                                        </a>
                                      )}
                                      {photoHref && (
                                        <a
                                          href={photoHref}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="inline-flex items-center gap-1 text-accent hover:underline"
                                        >
                                          <ImageIcon size={12} /> Фото <ExternalLink size={11} />
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </Card>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Tab 3: Physical Construction Milestones */}
      {activeTab === 'construction' && (
        <div className="space-y-4">
          {milestonesLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SkeletonCard />
              <SkeletonCard />
            </div>
          ) : milestones.length === 0 ? (
            <Card>
              <p className="text-sm text-text-secondary">
                Этапы строительства пока не добавлены.
              </p>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {milestones.map((m) => {
                const physicalPct = calcProgressPct(m.actual_qty, m.planned_qty)
                const budgetPct = calcKopeckPct(m.spent.kopecks_str, m.budget.kopecks_str)
                const statusMeta = MILESTONE_STATUS_LABELS[m.status] ?? {
                  label: m.status,
                  variant: 'default' as const,
                }
                const photoHref = safeExternalUrl(m.photo_url)

                return (
                  <Card key={m.id} className="space-y-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-semibold font-display text-text">
                            {m.title}
                          </h3>
                          <Badge variant={statusMeta.variant}>{statusMeta.label}</Badge>
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          Код: {m.code} · Категория: {m.category}
                        </p>
                      </div>
                      {photoHref && (
                        <a
                          href={photoHref}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline shrink-0"
                        >
                          <ImageIcon size={13} /> Фото <ExternalLink size={11} />
                        </a>
                      )}
                    </div>

                    {/* Physical Plan vs Actual */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Физический прогресс (план / факт)</span>
                        <span className="font-medium text-text">
                          {m.actual_qty} / {m.planned_qty} {m.unit} ({physicalPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-green transition-all duration-500"
                          style={{ width: `${physicalPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Spent vs Budget */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-text-secondary">Бюджет (оплачено / смета)</span>
                        <span className="font-medium text-text">
                          {m.spent.rubles_str} ₽ / {m.budget.rubles_str} ₽ ({budgetPct}%)
                        </span>
                      </div>
                      <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
                        <div
                          className="h-full bg-accent transition-all duration-500"
                          style={{ width: `${budgetPct}%` }}
                        />
                      </div>
                    </div>
                  </Card>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
