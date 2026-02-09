import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Shield, Award, TrendingUp, Users, MessageSquare, AlertTriangle } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import axios from 'axios'
import { toast } from 'sonner'

interface UserRole {
  id: number
  user_id: number
  username: string
  email: string
  role: string
  total_points: number
  posts_created: number
  threads_created: number
  can_post: boolean
  can_comment: boolean
  can_create_threads: boolean
  can_moderate: boolean
}

const ROLE_TIERS = [
  { value: 'new_user', label: 'Новичок', level: 0, color: 'text-gray-400' },
  { value: 'member', label: 'Участник', level: 1, color: 'text-blue-400' },
  { value: 'senior_member', label: 'Опытный участник', level: 2, color: 'text-purple-400' },
  { value: 'moderator', label: 'Модератор', level: 3, color: 'text-yellow-400' },
  { value: 'super_moderator', label: 'Супермодератор', level: 4, color: 'text-red-400' },
]

export default function ForumRoles() {
  const [users, setUsers] = useState<UserRole[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<string>('all')

  useEffect(() => {
    fetchUsers()
  }, [])

  const fetchUsers = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/forum/roles/users')
      setUsers(response.data.users || [])
    } catch (error) {
      console.error('Error fetching users:', error)
      toast.error('Не удалось загрузить пользователей')
      setUsers([])
    } finally {
      setLoading(false)
    }
  }

  const handlePromoteUser = async (userId: number, currentRole: string) => {
    const currentTier = ROLE_TIERS.find(t => t.value === currentRole)
    const nextTier = ROLE_TIERS[currentTier ? currentTier.level + 1 : 1]

    if (!nextTier) {
      toast.error('Максимальный уровень достигнут')
      return
    }

    try {
      await axios.post(`/api/forum/roles/promote/${userId}`, {
        new_role: nextTier.value
      })
      toast.success(`Пользователь повышен до ${nextTier.label}`)
      fetchUsers()
    } catch (error) {
      toast.error('Ошибка при повышении пользователя')
    }
  }

  const handleDemoteUser = async (userId: number, currentRole: string) => {
    const currentTier = ROLE_TIERS.find(t => t.value === currentRole)
    const prevTier = ROLE_TIERS[currentTier && currentTier.level > 0 ? currentTier.level - 1 : 0]

    if (!prevTier) {
      toast.error('Минимальный уровень достигнут')
      return
    }

    try {
      await axios.post(`/api/forum/roles/demote/${userId}`, {
        new_role: prevTier.value
      })
      toast.success(`Пользователь понижен до ${prevTier.label}`)
      fetchUsers()
    } catch (error) {
      toast.error('Ошибка при понижении пользователя')
    }
  }

  const getRoleTier = (role: string) => {
    return ROLE_TIERS.find(t => t.value === role) || ROLE_TIERS[0]
  }

  const filteredUsers = selectedRole === 'all'
    ? (users || [])
    : (users || []).filter(u => u.role === selectedRole)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Форум</h1>
          <p className="text-text-secondary mt-1">
            Управление ролями пользователей и системой репутации
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Shield className="text-accent" size={32} />
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <Link
          to={ROUTES.ADMIN_FORUM}
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <MessageSquare size={16} className="inline mr-2" />
          Темы
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_ROLES}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/10 text-accent border-b-2 border-accent"
        >
          <Shield size={16} className="inline mr-2" />
          Роли
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_MODERATION}
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <AlertTriangle size={16} className="inline mr-2" />
          Модерация
        </Link>
      </div>

      {/* Role stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {ROLE_TIERS.slice(0, 4).map(tier => {
          const count = users?.filter(u => u.role === tier.value).length || 0
          return (
            <Card key={tier.value}>
              <div className="p-6">
                <div className="flex items-center justify-between mb-2">
                  <Award className={tier.color} size={24} />
                  <span className="text-2xl font-bold text-text">{count}</span>
                </div>
                <div className="text-sm font-medium text-text-secondary">
                  {tier.label}
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Card>
        <div className="p-6 border-b border-border">
          <div className="flex gap-2">
            <Button
              variant={selectedRole === 'all' ? 'primary' : 'secondary'}
              onClick={() => setSelectedRole('all')}
            >
              Все
            </Button>
            {ROLE_TIERS.map(tier => (
              <Button
                key={tier.value}
                variant={selectedRole === tier.value ? 'primary' : 'secondary'}
                onClick={() => setSelectedRole(tier.value)}
              >
                {tier.label}
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-text-muted">
            Загрузка...
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            Пользователи не найдены
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Пользователь
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Роль
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Репутация
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Активность
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredUsers.map((user) => {
                  const roleTier = getRoleTier(user.role)
                  return (
                    <tr key={user.id} className="hover:bg-bg-elevated transition-colors">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-text">{user.username}</div>
                          <div className="text-sm text-text-muted">{user.email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Shield size={16} className={roleTier.color} />
                          <span className={`font-medium ${roleTier.color}`}>
                            {roleTier.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <TrendingUp size={16} className="text-accent" />
                          <span className="font-medium text-text">{user.total_points}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-text-muted space-y-1">
                          <div>Темы: {user.threads_created}</div>
                          <div>Посты: {user.posts_created}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handlePromoteUser(user.user_id, user.role)}
                            disabled={roleTier.level >= ROLE_TIERS.length - 1}
                          >
                            Повысить
                          </Button>
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => handleDemoteUser(user.user_id, user.role)}
                            disabled={roleTier.level <= 0}
                          >
                            Понизить
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
