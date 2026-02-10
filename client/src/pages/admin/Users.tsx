import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'
import { COUNTRIES } from '@/data/countries'
import {
  Search,
  Loader2,
  UserCheck,
  UserX,
  Users as UsersIcon,
  ChevronDown,
  ChevronUp,
  MapPin,
  Briefcase,
  Heart,
  Sparkles,
  Calendar,
  Globe,
  MessageSquare,
} from 'lucide-react'
import type { PortalUser } from '@/types'

function getCountryName(code: string): string {
  const c = COUNTRIES.find((c) => c.code === code)
  return c ? `${c.flag} ${c.name.ru}` : code
}

function formatLocation(user: PortalUser & Record<string, unknown>): string {
  const parts: string[] = []
  if (user.country_code) parts.push(getCountryName(user.country_code as string))
  if (user.city) parts.push(user.city as string)
  if (user.region) parts.push(user.region as string)
  if (parts.length === 0 && user.location) return user.location
  return parts.join(', ') || '--'
}

interface ExtendedUser extends PortalUser {
  avatar_url?: string
  onboarding_completed_at?: string
  country_code?: string
  city?: string
  region?: string
  birth_year?: number
  gender?: string
  bio?: string
  profession?: string
  skills?: string[]
  interests?: string[]
  hobbies?: string[]
  motivation?: string
  participation_interest?: string
}

function UserDetailRow({ user }: { user: ExtendedUser }) {
  const hasProfile = user.country_code || user.bio || user.profession || user.motivation ||
    (user.skills && user.skills.length > 0) || (user.interests && user.interests.length > 0)

  if (!hasProfile) {
    return (
      <div className="p-4 text-center text-text-muted text-sm">
        Профиль не заполнен
      </div>
    )
  }

  const participationLabels: Record<string, string> = {
    relocate: 'Переезд',
    invest: 'Инвестиции',
    remote: 'Удалённое участие',
    visit: 'Визит/отдых',
    other: 'Другое',
  }

  const genderLabels: Record<string, string> = {
    male: 'Мужской',
    female: 'Женский',
    other: 'Другой',
    prefer_not_to_say: 'Не указан',
  }

  return (
    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
      {/* Left column */}
      <div className="space-y-3">
        {user.bio && (
          <div>
            <span className="text-text-muted block mb-1">О себе</span>
            <p className="text-text-secondary leading-relaxed">{user.bio}</p>
          </div>
        )}

        {user.motivation && (
          <div>
            <span className="text-text-muted block mb-1">Мотивация</span>
            <p className="text-text-secondary leading-relaxed">{user.motivation}</p>
          </div>
        )}

        {(user.birth_year || user.gender) && (
          <div className="flex items-center gap-4 text-text-secondary">
            {user.birth_year && (
              <span className="flex items-center gap-1">
                <Calendar size={14} className="text-text-muted" />
                {user.birth_year} г.р.
              </span>
            )}
            {user.gender && (
              <span>{genderLabels[user.gender] ?? user.gender}</span>
            )}
          </div>
        )}

        {user.participation_interest && (
          <div className="flex items-center gap-1.5">
            <Globe size={14} className="text-text-muted" />
            <span className="text-text-secondary">
              {participationLabels[user.participation_interest] ?? user.participation_interest}
            </span>
          </div>
        )}
      </div>

      {/* Right column — tags */}
      <div className="space-y-3">
        {user.skills && user.skills.length > 0 && (
          <div>
            <span className="flex items-center gap-1 text-text-muted mb-1.5">
              <Sparkles size={14} /> Навыки
            </span>
            <div className="flex flex-wrap gap-1.5">
              {user.skills.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-accent/10 text-accent text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}

        {user.interests && user.interests.length > 0 && (
          <div>
            <span className="flex items-center gap-1 text-text-muted mb-1.5">
              <Heart size={14} /> Интересы
            </span>
            <div className="flex flex-wrap gap-1.5">
              {user.interests.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-400 text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}

        {user.hobbies && user.hobbies.length > 0 && (
          <div>
            <span className="flex items-center gap-1 text-text-muted mb-1.5">
              <MessageSquare size={14} /> Хобби
            </span>
            <div className="flex flex-wrap gap-1.5">
              {user.hobbies.map((s) => (
                <span key={s} className="px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-400 text-xs">{s}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default function Users() {
  const [users, setUsers] = useState<ExtendedUser[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [searchDebounced, setSearchDebounced] = useState('')
  const [expandedId, setExpandedId] = useState<number | null>(null)

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

  const toggleStatus = async (user: ExtendedUser) => {
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
                  <th className="text-left p-3 text-text-secondary font-medium">Пользователь</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Статус</th>
                  <th className="text-left p-3 text-text-secondary font-medium">
                    <span className="flex items-center gap-1"><MapPin size={13} /> Локация</span>
                  </th>
                  <th className="text-left p-3 text-text-secondary font-medium">
                    <span className="flex items-center gap-1"><Briefcase size={13} /> Профессия</span>
                  </th>
                  <th className="text-left p-3 text-text-secondary font-medium">Регистрация</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <>
                    <tr
                      key={user.id}
                      className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors cursor-pointer"
                      onClick={() => setExpandedId(expandedId === user.id ? null : user.id)}
                    >
                      {/* Avatar + Name + Email */}
                      <td className="p-3">
                        <div className="flex items-center gap-3">
                          {user.avatar_url ? (
                            <img
                              src={user.avatar_url}
                              alt=""
                              className="w-8 h-8 rounded-full object-cover border border-border flex-shrink-0"
                            />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-bg-elevated border border-border flex items-center justify-center text-text-muted text-xs font-medium flex-shrink-0">
                              {(user.name || user.email)[0]?.toUpperCase()}
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-medium truncate">{user.name}</div>
                            <div className="text-text-muted text-xs truncate">{user.email}</div>
                          </div>
                          <button className="ml-auto text-text-muted hover:text-text transition-colors p-1">
                            {expandedId === user.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                        </div>
                      </td>

                      <td className="p-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[user.status] ?? ''}`}>
                          {statusLabels[user.status] ?? user.status}
                        </span>
                        {user.onboarding_completed_at && (
                          <span className="ml-1.5 px-1.5 py-0.5 rounded-full text-[10px] bg-accent/10 text-accent font-medium">
                            Onboarded
                          </span>
                        )}
                      </td>

                      <td className="p-3 text-text-secondary max-w-[200px] truncate">
                        {formatLocation(user as PortalUser & Record<string, unknown>)}
                      </td>

                      <td className="p-3 text-text-secondary">
                        {user.profession || '--'}
                      </td>

                      <td className="p-3 text-text-muted">
                        {new Date(user.created_at).toLocaleDateString('ru-RU')}
                      </td>

                      <td className="p-3" onClick={(e) => e.stopPropagation()}>
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

                    {/* Expandable detail row */}
                    {expandedId === user.id && (
                      <tr key={`${user.id}-detail`} className="border-b border-border/50 bg-bg-elevated/30">
                        <td colSpan={6}>
                          <UserDetailRow user={user} />
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
