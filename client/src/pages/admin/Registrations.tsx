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

export default function Registrations() {
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

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

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Заявки</h1>
        <span className="text-sm text-text-secondary">{total} всего</span>
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
                    onClick={() => openDetail(reg)}
                    className="border-b border-border/50 hover:bg-bg-elevated/50
                      transition-colors cursor-pointer"
                  >
                    <td className="p-3 font-medium">{reg.name}</td>
                    <td className="p-3 text-text-secondary">{reg.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[reg.status] ?? ''}`}>
                        {STATUS_LABELS[reg.status] ?? reg.status}
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary">{reg.location || '--'}</td>
                    <td className="p-3 text-text-muted">
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
