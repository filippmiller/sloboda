import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import { useAdminStore } from '@/stores/adminStore'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from 'sonner'
import {
  Loader2,
  UserPlus,
  Trash2,
  ShieldCheck,
  Shield,
  Copy,
  CheckCircle2,
} from 'lucide-react'
import type { AdminUser } from '@/types'

export default function Admins() {
  const currentAdmin = useAdminStore((s) => s.admin)
  const isSuperAdmin = currentAdmin?.role === 'super_admin'

  const [admins, setAdmins] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Invite modal
  const [inviteOpen, setInviteOpen] = useState(false)
  const [inviteForm, setInviteForm] = useState({ email: '', name: '' })
  const [inviting, setInviting] = useState(false)
  const [inviteLink, setInviteLink] = useState<string | null>(null)

  const fetchAdmins = useCallback(async () => {
    setLoading(true)
    try {
      const res = await adminApi.get('/admins')
      setAdmins(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки администраторов')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (isSuperAdmin) {
      fetchAdmins()
    } else {
      setLoading(false)
    }
  }, [fetchAdmins, isSuperAdmin])

  const handleInvite = async () => {
    if (!inviteForm.email.trim()) {
      toast.error('Введите email')
      return
    }

    setInviting(true)
    try {
      const res = await adminApi.post('/auth/invite', {
        email: inviteForm.email,
        name: inviteForm.name || undefined,
      })
      const token = res.data.data?.token ?? res.data.token
      if (token) {
        const link = `${window.location.origin}/admin/invite/${token}`
        setInviteLink(link)
      }
      toast.success('Приглашение создано')
      fetchAdmins()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Ошибка'
      toast.error(msg)
    } finally {
      setInviting(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await adminApi.delete(`/admins/${deleteId}`)
      toast.success('Администратор удалён')
      setDeleteId(null)
      fetchAdmins()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Ошибка удаления'
      toast.error(msg)
    } finally {
      setDeleting(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Ссылка скопирована')
  }

  if (!isSuperAdmin) {
    return (
      <div>
        <h1 className="text-2xl font-bold font-display mb-6">Администраторы</h1>
        <Card>
          <div className="text-center py-12 text-text-muted text-sm">
            <Shield size={40} className="mx-auto mb-3 opacity-50" />
            <p>Доступ только для super_admin</p>
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Администраторы</h1>
        <Button size="sm" onClick={() => { setInviteOpen(true); setInviteLink(null); setInviteForm({ email: '', name: '' }) }}>
          <UserPlus size={16} />
          Пригласить
        </Button>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : admins.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Администраторов не найдено
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-text-secondary font-medium">Имя</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Email</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Роль</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Создан</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {admins.map(a => (
                  <tr key={a.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                    <td className="p-3 font-medium">{a.name || '--'}</td>
                    <td className="p-3 text-text-secondary">{a.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium inline-flex items-center gap-1
                        ${a.role === 'super_admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {a.role === 'super_admin' ? <ShieldCheck size={12} /> : <Shield size={12} />}
                        {a.role === 'super_admin' ? 'Super Admin' : 'Admin'}
                      </span>
                    </td>
                    <td className="p-3 text-text-muted">
                      {new Date(a.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="p-3">
                      {a.id !== currentAdmin?.id && (
                        <button
                          onClick={() => setDeleteId(a.id)}
                          className="p-1.5 rounded text-text-secondary hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Invite Modal */}
      <Modal
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Пригласить администратора"
      >
        <div className="flex flex-col gap-4">
          {inviteLink ? (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-green-400">
                <CheckCircle2 size={18} />
                <span className="text-sm font-medium">Приглашение создано</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  className="flex-1 px-3 py-2 rounded-lg bg-bg border border-border
                    text-text text-xs font-mono truncate"
                />
                <Button size="sm" variant="secondary" onClick={() => copyToClipboard(inviteLink)}>
                  <Copy size={14} />
                </Button>
              </div>
              <p className="text-xs text-text-muted">
                Отправьте эту ссылку новому администратору. Она действует 48 часов.
              </p>
            </div>
          ) : (
            <>
              <Input
                label="Email"
                type="email"
                value={inviteForm.email}
                onChange={e => setInviteForm(prev => ({ ...prev, email: e.target.value }))}
                placeholder="admin@example.com"
              />
              <Input
                label="Имя (необязательно)"
                value={inviteForm.name}
                onChange={e => setInviteForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Имя администратора"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" size="sm" onClick={() => setInviteOpen(false)}>
                  Отмена
                </Button>
                <Button size="sm" loading={inviting} onClick={handleInvite}>
                  <UserPlus size={14} />
                  Пригласить
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Удалить администратора?"
        description="Этот пользователь потеряет доступ к панели управления."
      >
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
            Удалить
          </Button>
        </div>
      </Modal>
    </div>
  )
}
