import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROUTES } from '@/config/routes'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'
import {
  UserPlus,
  Users,
  Lightbulb,
  TrendingUp,
  ArrowRight,
  FileText,
  Loader2,
} from 'lucide-react'
import type { Registration, AnalyticsOverview } from '@/types'

interface DashboardData {
  overview: AnalyticsOverview | null
  userCount: number
  pendingKnowledge: number
  recentRegistrations: Registration[]
}

export default function AdminDashboard() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData>({
    overview: null,
    userCount: 0,
    pendingKnowledge: 0,
    recentRegistrations: [],
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [overviewRes, usersRes, knowledgeRes, regsRes] = await Promise.allSettled([
          adminApi.get('/analytics/overview'),
          adminApi.get('/admin/users'),
          adminApi.get('/admin/knowledge', { params: { status: 'pending' } }),
          adminApi.get('/registrations', { params: { limit: 5 } }),
        ])

        setData({
          overview: overviewRes.status === 'fulfilled' ? overviewRes.value.data.data : null,
          userCount: usersRes.status === 'fulfilled' ? (usersRes.value.data.total ?? usersRes.value.data.data?.length ?? 0) : 0,
          pendingKnowledge: knowledgeRes.status === 'fulfilled' ? (knowledgeRes.value.data.data?.length ?? 0) : 0,
          recentRegistrations: regsRes.status === 'fulfilled' ? (regsRes.value.data.data ?? []) : [],
        })
      } catch {
        toast.error('Ошибка загрузки данных')
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  const stats = [
    {
      label: 'Всего заявок',
      value: data.overview?.total_registrations ?? 0,
      icon: UserPlus,
      color: 'text-accent',
    },
    {
      label: 'За неделю',
      value: data.overview?.this_week ?? 0,
      icon: TrendingUp,
      color: 'text-green',
    },
    {
      label: 'Пользователей',
      value: data.userCount,
      icon: Users,
      color: 'text-blue-400',
    },
    {
      label: 'Ожидают проверки',
      value: data.pendingKnowledge,
      icon: Lightbulb,
      color: 'text-yellow-400',
    },
  ]

  const statusLabels: Record<string, string> = {
    new: 'Новая',
    contacted: 'Связались',
    qualified: 'Подходит',
    converted: 'Принят',
    rejected: 'Отклонён',
  }

  const statusColors: Record<string, string> = {
    new: 'bg-blue-500/20 text-blue-400',
    contacted: 'bg-yellow-500/20 text-yellow-400',
    qualified: 'bg-green-500/20 text-green-400',
    converted: 'bg-purple-500/20 text-purple-400',
    rejected: 'bg-red-500/20 text-red-400',
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-display mb-6">Обзор</h1>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <Card key={stat.label} padding="md">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-text-secondary">{stat.label}</p>
                <p className="text-2xl font-bold font-display mt-1">{stat.value}</p>
              </div>
              <stat.icon size={24} className={stat.color} />
            </div>
          </Card>
        ))}
      </div>

      {/* Quick actions */}
      <div className="flex gap-3 mb-8">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(ROUTES.ADMIN_REGISTRATIONS)}
        >
          <UserPlus size={16} />
          Заявки
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(ROUTES.ADMIN_KNOWLEDGE)}
        >
          <Lightbulb size={16} />
          Знания
          <ArrowRight size={14} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => navigate(ROUTES.ADMIN_POSTS)}
        >
          <FileText size={16} />
          Новая публикация
          <ArrowRight size={14} />
        </Button>
      </div>

      {/* Recent registrations */}
      <Card padding="none">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold font-display text-sm">Последние заявки</h2>
          <button
            onClick={() => navigate(ROUTES.ADMIN_REGISTRATIONS)}
            className="text-xs text-accent hover:text-accent-hover transition-colors"
          >
            Все заявки
          </button>
        </div>

        {data.recentRegistrations.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Заявок пока нет
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
                {data.recentRegistrations.map((reg) => (
                  <tr
                    key={reg.id}
                    className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors cursor-pointer"
                    onClick={() => navigate(ROUTES.ADMIN_REGISTRATIONS)}
                  >
                    <td className="p-3 font-medium">{reg.name}</td>
                    <td className="p-3 text-text-secondary">{reg.email}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[reg.status] ?? ''}`}>
                        {statusLabels[reg.status] ?? reg.status}
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
      </Card>
    </div>
  )
}
