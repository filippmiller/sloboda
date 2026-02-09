import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, Shield, Ban, AlertCircle, Lock, Trash2, MessageSquare } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import axios from 'axios'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

interface ModAction {
  id: number
  moderator_username: string
  action_type: string
  target_username: string
  reason: string
  created_at: string
}

interface Ban {
  id: number
  user_id: number
  username: string
  email: string
  ban_type: string
  reason: string
  banned_at: string
  expires_at: string | null
  is_active: boolean
}

interface Warning {
  id: number
  user_id: number
  username: string
  email: string
  severity: string
  reason: string
  created_at: string
}

const ACTION_TYPES = {
  delete_comment: { label: 'Удаление комментария', icon: Trash2, color: 'text-red-400' },
  delete_thread: { label: 'Удаление темы', icon: Trash2, color: 'text-red-400' },
  ban_user: { label: 'Бан пользователя', icon: Ban, color: 'text-red-500' },
  warn_user: { label: 'Предупреждение', icon: AlertTriangle, color: 'text-yellow-500' },
  lock_thread: { label: 'Блокировка темы', icon: Lock, color: 'text-orange-500' },
  pin_thread: { label: 'Закрепление темы', icon: AlertCircle, color: 'text-blue-500' },
}

export default function ForumModeration() {
  const [activeTab, setActiveTab] = useState<'log' | 'bans' | 'warnings'>('log')
  const [modActions, setModActions] = useState<ModAction[]>([])
  const [bans, setBans] = useState<Ban[]>([])
  const [warnings, setWarnings] = useState<Warning[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchData()
  }, [activeTab])

  const fetchData = async () => {
    setLoading(true)
    try {
      if (activeTab === 'log') {
        const response = await axios.get('/api/forum/moderation/actions')
        setModActions(response.data.actions)
      } else if (activeTab === 'bans') {
        const response = await axios.get('/api/forum/moderation/bans')
        setBans(response.data.bans)
      } else if (activeTab === 'warnings') {
        const response = await axios.get('/api/forum/moderation/warnings')
        setWarnings(response.data.warnings)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }

  const handleLiftBan = async (banId: number) => {
    if (!confirm('Снять бан с пользователя?')) return

    try {
      await axios.post(`/api/forum/moderation/bans/${banId}/lift`)
      toast.success('Бан снят')
      fetchData()
    } catch (error) {
      toast.error('Ошибка при снятии бана')
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Форум</h1>
          <p className="text-text-secondary mt-1">
            Журнал действий, баны и предупреждения
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
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <Shield size={16} className="inline mr-2" />
          Роли
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_MODERATION}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/10 text-accent border-b-2 border-accent"
        >
          <AlertTriangle size={16} className="inline mr-2" />
          Модерация
        </Link>
      </div>

      <Card>
        <div className="p-6 border-b border-border">
          <div className="flex gap-2">
            <Button
              variant={activeTab === 'log' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('log')}
            >
              Журнал действий
            </Button>
            <Button
              variant={activeTab === 'bans' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('bans')}
            >
              Баны
            </Button>
            <Button
              variant={activeTab === 'warnings' ? 'primary' : 'secondary'}
              onClick={() => setActiveTab('warnings')}
            >
              Предупреждения
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-text-muted">
            Загрузка...
          </div>
        ) : (
          <>
            {activeTab === 'log' && (
              <div className="overflow-x-auto">
                {modActions.length === 0 ? (
                  <div className="p-12 text-center text-text-muted">
                    Действия не найдены
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Действие
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Модератор
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Пользователь
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Причина
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Время
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {modActions.map((action) => {
                        const actionConfig = ACTION_TYPES[action.action_type as keyof typeof ACTION_TYPES] || {
                          label: action.action_type,
                          icon: AlertCircle,
                          color: 'text-text-muted'
                        }
                        const Icon = actionConfig.icon
                        return (
                          <tr key={action.id} className="hover:bg-bg-elevated transition-colors">
                            <td className="px-6 py-4">
                              <div className="flex items-center gap-2">
                                <Icon size={16} className={actionConfig.color} />
                                <span className="text-sm text-text">{actionConfig.label}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm text-text-secondary">
                              {action.moderator_username || 'Система'}
                            </td>
                            <td className="px-6 py-4 text-sm text-text">
                              {action.target_username || 'Не указан'}
                            </td>
                            <td className="px-6 py-4 text-sm text-text-muted max-w-md">
                              {action.reason}
                            </td>
                            <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                              {formatDistanceToNow(new Date(action.created_at), {
                                addSuffix: true,
                                locale: ru
                              })}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'bans' && (
              <div className="overflow-x-auto">
                {bans.length === 0 ? (
                  <div className="p-12 text-center text-text-muted">
                    Активные баны не найдены
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Пользователь
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Тип
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Причина
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Истекает
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Действия
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {bans.map((ban) => (
                        <tr key={ban.id} className="hover:bg-bg-elevated transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium text-text">{ban.username}</div>
                              <div className="text-sm text-text-muted">{ban.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              ban.ban_type === 'permanent'
                                ? 'bg-red-500/10 text-red-400'
                                : 'bg-yellow-500/10 text-yellow-400'
                            }`}>
                              <Ban size={12} />
                              {ban.ban_type === 'permanent' ? 'Permanent' : 'Временный'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-text-muted max-w-md">
                            {ban.reason}
                          </td>
                          <td className="px-6 py-4 text-sm text-text-secondary">
                            {ban.expires_at
                              ? formatDistanceToNow(new Date(ban.expires_at), {
                                  addSuffix: true,
                                  locale: ru
                                })
                              : 'Никогда'}
                          </td>
                          <td className="px-6 py-4">
                            {ban.is_active && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => handleLiftBan(ban.id)}
                              >
                                Снять бан
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}

            {activeTab === 'warnings' && (
              <div className="overflow-x-auto">
                {warnings.length === 0 ? (
                  <div className="p-12 text-center text-text-muted">
                    Предупреждения не найдены
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="border-b border-border">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Пользователь
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Степень
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Причина
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                          Время
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {warnings.map((warning) => (
                        <tr key={warning.id} className="hover:bg-bg-elevated transition-colors">
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium text-text">{warning.username}</div>
                              <div className="text-sm text-text-muted">{warning.email}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${
                              warning.severity === 'high'
                                ? 'bg-red-500/10 text-red-400'
                                : warning.severity === 'medium'
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-blue-500/10 text-blue-400'
                            }`}>
                              <AlertTriangle size={12} />
                              {warning.severity === 'high' ? 'Высокая' : warning.severity === 'medium' ? 'Средняя' : 'Низкая'}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-text-muted max-w-md">
                            {warning.reason}
                          </td>
                          <td className="px-6 py-4 text-sm text-text-secondary whitespace-nowrap">
                            {formatDistanceToNow(new Date(warning.created_at), {
                              addSuffix: true,
                              locale: ru
                            })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  )
}
