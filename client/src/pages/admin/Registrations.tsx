import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import { toast } from 'sonner'
import {
  Search,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Send,
  StickyNote,
  MapPin,
  Phone,
  Mail,
  Briefcase,
  DollarSign,
  Download,
  CheckSquare,
} from 'lucide-react'
import type { Registration, RegistrationNote } from '@/types'

const STATUS_OPTIONS = [
  { value: '', label: 'Все статусы' },
  { value: 'new', label: 'Новые' },
  { value: 'contacted', label: 'Связались' },
  { value: 'qualified', label: 'Подходит' },
  { value: 'converted', label: 'Принят' },
  { value: 'rejected', label: 'Отклонён' },
]

const STATUS_LABELS: Record<string, string> = {
  new: 'Новая',
  contacted: 'Связались',
  qualified: 'Подходит',
  converted: 'Принят',
  rejected: 'Отклонён',
}

const STATUS_COLORS: Record<string, string> = {
  new: 'bg-blue-500/20 text-blue-400',
  contacted: 'bg-yellow-500/20 text-yellow-400',
  qualified: 'bg-green-500/20 text-green-400',
  converted: 'bg-purple-500/20 text-purple-400',
  rejected: 'bg-red-500/20 text-red-400',
}

const PAGE_SIZE = 20

function escapeCSV(val: string): string {
  if (!val) return ''
  if (val.includes(',') || val.includes('"') || val.includes('\n')) {
    return `"${val.replace(/"/g, '""')}"`
  }
  return val
}

export default function Registrations() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set())
  const [bulkStatus, setBulkStatus] = useState('')
  const [bulkUpdating, setBulkUpdating] = useState(false)

  // Detail modal
  const [selected, setSelected] = useState<Registration | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [notes, setNotes] = useState<RegistrationNote[]>([])
  const [newNote, setNewNote] = useState('')
  const [notesLoading, setNotesLoading] = useState(false)
  const [statusUpdating, setStatusUpdating] = useState(false)
  const [inviting, setInviting] = useState(false)

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchRegistrations = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }
      if (statusFilter) params.status = statusFilter
      if (searchDebounced) params.search = searchDebounced

      const res = await adminApi.get('/registrations', { params })
      setRegistrations(res.data.data ?? [])
      setTotal(res.data.total ?? 0)
    } catch {
      toast.error('Ошибка загрузки заявок')
    } finally {
      setLoading(false)
    }
  }, [page, statusFilter, searchDebounced])

  useEffect(() => {
    fetchRegistrations()
  }, [fetchRegistrations])

  // Reset page on filter change
  useEffect(() => {
    setPage(0)
    setSelectedIds(new Set())
  }, [statusFilter, searchDebounced])

  const openDetail = async (reg: Registration) => {
    setSelected(reg)
    setModalOpen(true)
    setNotesLoading(true)
    try {
      const res = await adminApi.get(`/registrations/${reg.id}/notes`)
      setNotes(res.data.data ?? [])
    } catch {
      setNotes([])
    } finally {
      setNotesLoading(false)
    }
  }

  const handleStatusChange = async (regId: number, newStatus: string) => {
    setStatusUpdating(true)
    try {
      await adminApi.patch(`/registrations/${regId}`, { status: newStatus })
      toast.success('Статус обновлён')
      if (selected) {
        setSelected({ ...selected, status: newStatus as Registration['status'] })
      }
      fetchRegistrations()
    } catch {
      toast.error('Ошибка обновления статуса')
    } finally {
      setStatusUpdating(false)
    }
  }

  const handleAddNote = async () => {
    if (!selected || !newNote.trim()) return
    try {
      const res = await adminApi.post(`/registrations/${selected.id}/notes`, { note: newNote })
      setNotes([...notes, res.data.data])
      setNewNote('')
      toast.success('Заметка добавлена')
    } catch {
      toast.error('Ошибка добавления заметки')
    }
  }

  const handleInvite = async () => {
    if (!selected) return
    setInviting(true)
    try {
      await adminApi.post(`/admin/users/${selected.id}/invite`)
      toast.success('Приглашение отправлено')
      handleStatusChange(selected.id, 'converted')
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Ошибка отправки'
      toast.error(msg)
    } finally {
      setInviting(false)
    }
  }

  // Bulk selection handlers
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (selectedIds.size === registrations.length) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(registrations.map(r => r.id)))
    }
  }

  const handleBulkStatusChange = async () => {
    if (!bulkStatus || selectedIds.size === 0) return
    setBulkUpdating(true)
    let success = 0
    let failed = 0
    for (const id of selectedIds) {
      try {
        await adminApi.patch(`/registrations/${id}`, { status: bulkStatus })
        success++
      } catch {
        failed++
      }
    }
    setBulkUpdating(false)
    setSelectedIds(new Set())
    setBulkStatus('')
    if (success > 0) toast.success(`Обновлено: ${success}`)
    if (failed > 0) toast.error(`Ошибок: ${failed}`)
    fetchRegistrations()
  }

  // CSV Export
  const handleExportCSV = () => {
    const headers = ['ID', 'Имя', 'Email', 'Телефон', 'Локация', 'Мотивация', 'Участие', 'Навыки', 'Бюджет', 'Статус', 'Дата']
    const rows = registrations.map(r => [
      String(r.id),
      escapeCSV(r.name),
      escapeCSV(r.email),
      escapeCSV(r.phone ?? ''),
      escapeCSV(r.location ?? ''),
      escapeCSV(r.motivation ?? ''),
      escapeCSV(r.participation ?? ''),
      escapeCSV((r.skills ?? []).join('; ')),
      escapeCSV(r.budget_range ?? ''),
      escapeCSV(STATUS_LABELS[r.status] ?? r.status),
      new Date(r.created_at).toLocaleDateString('ru-RU'),
    ])

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `registrations-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('CSV скачан')
  }

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Заявки</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={handleExportCSV} disabled={registrations.length === 0}>
            <Download size={14} />
            CSV
          </Button>
          <span className="text-sm text-text-secondary">{total} всего</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1 max-w-xs">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск по имени или email..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-bg-card border border-border
              text-text text-sm placeholder:text-text-muted
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
              transition-colors"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-2 rounded-lg bg-bg-card border border-border
            text-text text-sm focus:outline-none focus:border-accent
            focus:ring-1 focus:ring-accent/30 transition-colors"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* Bulk Actions Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 mb-3 p-3 bg-accent/5 border border-accent/20 rounded-lg">
          <CheckSquare size={16} className="text-accent" />
          <span className="text-sm text-text-secondary">
            Выбрано: <strong className="text-text">{selectedIds.size}</strong>
          </span>
          <select
            value={bulkStatus}
            onChange={e => setBulkStatus(e.target.value)}
            className="px-2 py-1 rounded bg-bg-card border border-border text-text text-sm"
          >
            <option value="">Изменить статус...</option>
            {STATUS_OPTIONS.filter(o => o.value).map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <Button
            size="sm"
            disabled={!bulkStatus}
            loading={bulkUpdating}
            onClick={handleBulkStatusChange}
          >
            Применить
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
            Снять выделение
          </Button>
        </div>
      )}

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : registrations.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Заявок не найдено
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="p-3 w-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === registrations.length && registrations.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-border bg-bg-card text-accent focus:ring-accent/30"
                    />
                  </th>
                  <th className="text-left p-3 text-text-secondary font-medium">Имя</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Email</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Статус</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Локация</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Дата</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => (
                  <tr
                    key={reg.id}
                    className="border-b border-border/50 hover:bg-bg-elevated/50
                      transition-colors cursor-pointer"
                  >
                    <td className="p-3" onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selectedIds.has(reg.id)}
                        onChange={() => toggleSelect(reg.id)}
                        className="w-4 h-4 rounded border-border bg-bg-card text-accent focus:ring-accent/30"
                      />
                    </td>
                    <td className="p-3 font-medium" onClick={() => openDetail(reg)}>{reg.name}</td>
                    <td className="p-3 text-text-secondary" onClick={() => openDetail(reg)}>{reg.email}</td>
                    <td className="p-3" onClick={() => openDetail(reg)}>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[reg.status] ?? ''}`}>
                        {STATUS_LABELS[reg.status] ?? reg.status}
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary" onClick={() => openDetail(reg)}>{reg.location || '--'}</td>
                    <td className="p-3 text-text-muted" onClick={() => openDetail(reg)}>
                      {new Date(reg.created_at).toLocaleDateString('ru-RU')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between p-3 border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft size={16} />
              Назад
            </Button>
            <span className="text-xs text-text-muted">
              {page + 1} / {totalPages}
            </span>
            <Button
              variant="ghost"
              size="sm"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
            >
              Далее
              <ChevronRight size={16} />
            </Button>
          </div>
        )}
      </Card>

      {/* Detail Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={selected?.name ?? 'Заявка'}
        description={`#${selected?.id ?? ''} -- ${new Date(selected?.created_at ?? '').toLocaleDateString('ru-RU')}`}
      >
        {selected && (
          <div className="flex flex-col gap-5">
            {/* Contact info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <Mail size={14} /> {selected.email}
              </div>
              {selected.phone && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <Phone size={14} /> {selected.phone}
                </div>
              )}
              {selected.location && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <MapPin size={14} /> {selected.location}
                </div>
              )}
              {selected.budget_range && (
                <div className="flex items-center gap-2 text-text-secondary">
                  <DollarSign size={14} /> {selected.budget_range}
                </div>
              )}
            </div>

            {/* Motivation */}
            {selected.motivation && (
              <div>
                <p className="text-xs text-text-muted mb-1 uppercase tracking-wider">Мотивация</p>
                <p className="text-sm text-text-secondary">{selected.motivation}</p>
              </div>
            )}

            {/* Skills */}
            {selected.skills && selected.skills.length > 0 && (
              <div>
                <p className="text-xs text-text-muted mb-1.5 uppercase tracking-wider flex items-center gap-1">
                  <Briefcase size={12} /> Навыки
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {selected.skills.map((skill) => (
                    <span
                      key={skill}
                      className="px-2 py-0.5 bg-bg-elevated border border-border rounded text-xs text-text-secondary"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Status change */}
            <div>
              <p className="text-xs text-text-muted mb-1.5 uppercase tracking-wider">Статус</p>
              <select
                value={selected.status}
                onChange={(e) => handleStatusChange(selected.id, e.target.value)}
                disabled={statusUpdating}
                className="px-3 py-1.5 rounded-lg bg-bg border border-border
                  text-text text-sm focus:outline-none focus:border-accent
                  disabled:opacity-50"
              >
                {STATUS_OPTIONS.filter((o) => o.value).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Notes */}
            <div>
              <p className="text-xs text-text-muted mb-2 uppercase tracking-wider flex items-center gap-1">
                <StickyNote size={12} /> Заметки
              </p>
              {notesLoading ? (
                <Loader2 size={16} className="animate-spin text-text-muted" />
              ) : notes.length === 0 ? (
                <p className="text-xs text-text-muted">Заметок пока нет</p>
              ) : (
                <div className="flex flex-col gap-2 mb-3 max-h-40 overflow-y-auto">
                  {notes.map((note) => (
                    <div key={note.id} className="bg-bg rounded-lg p-2 text-sm">
                      <p className="text-text-secondary">{note.content}</p>
                      <p className="text-xs text-text-muted mt-1">
                        {new Date(note.created_at).toLocaleString('ru-RU')}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Добавить заметку..."
                  className="flex-1 px-3 py-1.5 rounded-lg bg-bg border border-border
                    text-text text-sm placeholder:text-text-muted
                    focus:outline-none focus:border-accent"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleAddNote()
                  }}
                />
                <Button size="sm" onClick={handleAddNote} disabled={!newNote.trim()}>
                  Добавить
                </Button>
              </div>
            </div>

            {/* Invite */}
            {selected.status !== 'converted' && selected.status !== 'rejected' && (
              <Button
                variant="primary"
                size="sm"
                loading={inviting}
                onClick={handleInvite}
                className="self-start"
              >
                <Send size={14} />
                Отправить приглашение
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
