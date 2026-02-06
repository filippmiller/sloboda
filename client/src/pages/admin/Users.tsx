import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'
import {
  Search,
  Loader2,
  UserCheck,
  UserX,
  Users as UsersIcon,
} from 'lucide-react'
import type { PortalUser } from '@/types'

export default function Users() {
  const [users, setUsers] = useState<PortalUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')

  useEffect(() => {
    const timer = setTimeout(() => setSearchDebounced(search), 300)
    return () => clearTimeout(timer)
  }, [search])

  const fetchUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (searchDebounced) params.search = searchDebounced

      const res = await adminApi.get('/admin/users', { params })
      setUsers(res.data.data ?? [])
      setTotal(res.data.total ?? res.data.data?.length ?? 0)
    } catch {
      toast.error('Ошибка загрузки пользователей')
    } finally {
      setLoading(false)
    }
  }, [searchDebounced])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const toggleStatus = async (user: PortalUser) => {
    const newStatus = user.status === 'active' ? 'suspended' : 'active'
    try {
      await adminApi.patch(`/admin/users/${user.id}`, { status: newStatus })
      toast.success(newStatus === 'active' ? 'Пользователь активирован' : 'Пользователь заблокирован')
      fetchUsers()
    } catch {
      toast.error('Ошибка обновления статуса')
    }
  }

  const statusColors: Record<string, string> = {
    active: 'bg-green-500/20 text-green-400',
    suspended: 'bg-red-500/20 text-red-400',
  }

  const statusLabels: Record<string, string> = {
    active: 'Активен',
    suspended: 'Заблокирован',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold font-display">Пользователи</h1>
          <span className="flex items-center gap-1 text-sm text-text-secondary">
            <UsersIcon size={14} />
            {total}
          </span>
        </div>
      </div>

      {/* Search */}
      <div className="mb-4">
        <div className="relative max-w-xs">
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
      </div>

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : users.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Пользователей не найдено
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
                  <th className="text-left p-3 text-text-secondary font-medium">Последний вход</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Регистрация</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                    <td className="p-3 font-medium">{user.name}</td>
                    <td className="p-3 text-text-secondary">{user.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[user.status] ?? ''}`}>
                        {statusLabels[user.status] ?? user.status}
                      </span>
                    </td>
                    <td className="p-3 text-text-secondary">{user.location || '--'}</td>
                    <td className="p-3 text-text-muted">
                      {user.last_login
                        ? new Date(user.last_login).toLocaleDateString('ru-RU')
                        : '--'}
                    </td>
                    <td className="p-3 text-text-muted">
                      {new Date(user.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="p-3">
                      <Button
                        variant={user.status === 'active' ? 'danger' : 'secondary'}
                        size="sm"
                        onClick={() => toggleStatus(user)}
                      >
                        {user.status === 'active' ? (
                          <>
                            <UserX size={14} />
                            Блокировать
                          </>
                        ) : (
                          <>
                            <UserCheck size={14} />
                            Активировать
                          </>
                        )}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
