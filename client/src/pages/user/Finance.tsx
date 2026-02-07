import { useState, useEffect } from 'react'
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  Loader2,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
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

const CATEGORY_LABELS: Record<string, string> = {
  donation: 'Пожертвования',
  grant: 'Гранты',
  other_income: 'Прочие поступления',
  legal: 'Юридическая работа',
  platform: 'Платформа и хостинг',
  operations: 'Операционные расходы',
  equipment: 'Оборудование',
  land: 'Земля',
  reserve: 'Резервный фонд',
  ai_tools: 'ИИ-инструменты',
  other_expense: 'Прочие расходы',
}

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

function formatRubles(amount: number): string {
  return Math.round(amount * 100 / 100).toLocaleString('ru-RU') + ' ₽'
}

export default function Finance() {
  const [summary, setSummary] = useState<FinanceSummary | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [total, setTotal] = useState(0)
  const [filter, setFilter] = useState<'all' | 'income' | 'expense'>('all')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const limit = 20

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
      setLoading(true)
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

  const totalPages = Math.ceil(total / limit)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">Финансовая прозрачность</h1>
        <p className="text-text-secondary text-sm">
          Все средства проекта — в открытом доступе для участников.
        </p>
        <p className="text-text-muted text-xs mt-1">
          Данные обновляются при загрузке банковских выписок
        </p>
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
                <p className="text-xs text-text-secondary">Поступления</p>
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
                <p className="text-xs text-text-secondary">Расходы</p>
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
                <p className="text-xs text-text-secondary">Баланс</p>
              </div>
            </div>
          </Card>
        </div>
      ) : (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="animate-spin text-text-muted" size={24} />
        </div>
      )}

      {/* Charts */}
      {summary && summary.expenseBreakdown.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <h3 className="text-sm font-semibold font-display mb-4">Расходы по категориям</h3>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={summary.expenseBreakdown.map((e) => ({
                    name: CATEGORY_LABELS[e.category] || e.category,
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
                  contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: 8 }}
                  labelStyle={{ color: '#e0e0e0' }}
                  formatter={(value: number) => formatRubles(value)}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 mt-2">
              {summary.expenseBreakdown.map((e) => (
                <div key={e.category} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ background: CATEGORY_COLORS[e.category] || '#6b7280' }}
                  />
                  {CATEGORY_LABELS[e.category] || e.category}
                </div>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold font-display mb-4">Сводка</h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={[
                  { name: 'Доходы', amount: summary.totalIncome },
                  { name: 'Расходы', amount: summary.totalExpenses },
                ]}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#222" />
                <XAxis dataKey="name" tick={{ fill: '#888', fontSize: 12 }} />
                <YAxis tick={{ fill: '#888', fontSize: 12 }} />
                <Tooltip
                  contentStyle={{ background: '#141414', border: '1px solid #222', borderRadius: 8 }}
                  formatter={(value: number) => formatRubles(value)}
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
            onClick={() => { setFilter(f); setPage(0) }}
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

      {/* Transactions list */}
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
                  </div>
                </div>
              </div>
              <p
                className={`text-sm font-bold font-display flex-shrink-0 ${
                  t.type === 'income' ? 'text-green' : 'text-accent'
                }`}
              >
                {t.type === 'income' ? '+' : '-'}
                {formatRubles(parseFloat(t.amount))}
              </p>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-8">
            <Wallet className="mx-auto text-text-muted mb-3" size={32} />
            <p className="text-text-secondary text-sm">
              Финансовые данные скоро появятся
            </p>
            <p className="text-text-muted text-xs mt-1">
              Сбор средств начался. Первые данные появятся после загрузки банковской выписки.
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
    </div>
  )
}
