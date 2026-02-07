import { useState, useEffect, useCallback } from 'react'
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
} from 'lucide-react'
import api from '@/services/api'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'

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
  ALL_CATEGORIES.map((c) => [c.value, c.label])
)

function formatRubles(amount: number): string {
  return Math.round(amount * 100 / 100).toLocaleString('ru-RU') + ' ₽'
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

  const fetchSummary = useCallback(async () => {
    try {
      const res = await api.get('/admin/finance/summary')
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
      const res = await api.get('/admin/finance/transactions', { params })
      setTransactions(res.data.data ?? [])
      setTotal(res.data.total ?? 0)
    } catch {
      toast.error('Не удалось загрузить транзакции')
    } finally {
      setLoading(false)
    }
  }, [filter, search, page])

  useEffect(() => { fetchSummary() }, [fetchSummary])
  useEffect(() => { fetchTransactions() }, [fetchTransactions])

  const totalPages = Math.ceil(total / limit)

  // Category list depends on type
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
        await api.patch(`/admin/finance/transactions/${editingId}`, form)
        toast.success('Транзакция обновлена')
      } else {
        await api.post('/admin/finance/transactions', form)
        toast.success('Транзакция добавлена')
      }
      setModalOpen(false)
      fetchSummary()
      fetchTransactions()
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка сохранения'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!deleteId) return
    setDeleting(true)
    try {
      await api.delete(`/admin/finance/transactions/${deleteId}`)
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
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display mb-2">Финансы</h1>
          <p className="text-text-secondary text-sm">
            Управление доходами и расходами проекта
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus size={16} />
          Добавить
        </Button>
      </div>

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
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Поиск..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0) }}
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
                      <span className="text-text-muted truncate max-w-[150px]">{t.counterparty}</span>
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
          {/* Type */}
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

          {/* Category */}
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

          {/* Amount */}
          <Input
            label="Сумма (₽)"
            type="number"
            min="0.01"
            step="0.01"
            value={form.amount}
            onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            placeholder="0.00"
          />

          {/* Date */}
          <Input
            label="Дата"
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
          />

          {/* Description */}
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

          {/* Counterparty */}
          <Input
            label="Контрагент (не виден пользователям)"
            value={form.counterparty}
            onChange={(e) => setForm((f) => ({ ...f, counterparty: e.target.value }))}
            placeholder="Название организации или ФИО"
          />

          {/* Actions */}
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
        onOpenChange={(open) => { if (!open) setDeleteId(null) }}
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
  )
}
