import { useState, useEffect } from 'react'
import { BarChart3, TrendingUp, Users, MessageSquare, Activity, Award } from 'lucide-react'
import Card from '@/components/ui/Card'
import axios from 'axios'
import { toast } from 'sonner'
import { format, subDays, startOfDay } from 'date-fns'
import { ru } from 'date-fns/locale'

interface AnalyticsData {
  overview: {
    total_threads: number
    total_comments: number
    total_users: number
    active_users_7d: number
    avg_comments_per_thread: number
  }
  timeline: Array<{
    date: string
    threads: number
    comments: number
    users: number
  }>
  top_contributors: Array<{
    username: string
    threads_count: number
    comments_count: number
    reputation: number
  }>
  engagement_by_hour: Array<{
    hour: number
    activity_count: number
  }>
}

export default function ForumAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d')

  useEffect(() => {
    fetchAnalytics()
  }, [timeRange])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/forum/analytics', {
        params: { range: timeRange }
      })
      setData(response.data)
    } catch (error) {
      console.error('Error fetching analytics:', error)
      toast.error('Не удалось загрузить аналитику')
    } finally {
      setLoading(false)
    }
  }

  if (loading || !data) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold font-display text-text">Аналитика форума</h1>
        <div className="flex items-center justify-center py-12">
          <div className="text-text-muted">Загрузка...</div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Аналитика форума</h1>
          <p className="text-text-secondary mt-1">
            Статистика активности и вовлеченности пользователей
          </p>
        </div>
        <BarChart3 className="text-accent" size={32} />
      </div>

      {/* Time range selector */}
      <div className="flex gap-2">
        <button
          onClick={() => setTimeRange('7d')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            timeRange === '7d'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
          }`}
        >
          7 дней
        </button>
        <button
          onClick={() => setTimeRange('30d')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            timeRange === '30d'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
          }`}
        >
          30 дней
        </button>
        <button
          onClick={() => setTimeRange('90d')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            timeRange === '90d'
              ? 'bg-accent/10 text-accent'
              : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
          }`}
        >
          90 дней
        </button>
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <MessageSquare className="text-blue-400" size={24} />
              <span className="text-2xl font-bold text-text">{data.overview.total_threads}</span>
            </div>
            <div className="text-sm font-medium text-text-secondary">Всего тем</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Activity className="text-green-400" size={24} />
              <span className="text-2xl font-bold text-text">{data.overview.total_comments}</span>
            </div>
            <div className="text-sm font-medium text-text-secondary">Комментариев</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Users className="text-purple-400" size={24} />
              <span className="text-2xl font-bold text-text">{data.overview.total_users}</span>
            </div>
            <div className="text-sm font-medium text-text-secondary">Пользователей</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <TrendingUp className="text-yellow-400" size={24} />
              <span className="text-2xl font-bold text-text">{data.overview.active_users_7d}</span>
            </div>
            <div className="text-sm font-medium text-text-secondary">Активных за 7 дней</div>
          </div>
        </Card>

        <Card>
          <div className="p-6">
            <div className="flex items-center justify-between mb-2">
              <Award className="text-accent" size={24} />
              <span className="text-2xl font-bold text-text">
                {data.overview.avg_comments_per_thread.toFixed(1)}
              </span>
            </div>
            <div className="text-sm font-medium text-text-secondary">Среднее ком/тему</div>
          </div>
        </Card>
      </div>

      {/* Timeline chart */}
      <Card>
        <div className="p-6">
          <h2 className="text-xl font-bold text-text mb-4">Активность по дням</h2>
          <div className="h-64 flex items-end gap-2">
            {data.timeline.map((day, index) => {
              const maxValue = Math.max(...data.timeline.map(d => d.threads + d.comments))
              const height = ((day.threads + day.comments) / maxValue) * 100
              return (
                <div key={index} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-accent/20 hover:bg-accent/30 rounded-t transition-all cursor-pointer relative group"
                    style={{ height: `${height}%` }}
                  >
                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-bg-card border border-border rounded px-2 py-1 text-xs whitespace-nowrap">
                      <div className="font-medium">{format(new Date(day.date), 'd MMM', { locale: ru })}</div>
                      <div>Темы: {day.threads}</div>
                      <div>Комменты: {day.comments}</div>
                    </div>
                  </div>
                  <div className="text-xs text-text-muted">
                    {format(new Date(day.date), 'd MMM', { locale: ru })}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top contributors */}
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-bold text-text mb-4">Топ авторов</h2>
            <div className="space-y-3">
              {data.top_contributors.map((user, index) => (
                <div key={index} className="flex items-center justify-between p-3 rounded-lg bg-bg-elevated">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold ${
                      index === 0 ? 'bg-yellow-500/20 text-yellow-400' :
                      index === 1 ? 'bg-gray-400/20 text-gray-400' :
                      index === 2 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-bg-card text-text-secondary'
                    }`}>
                      {index + 1}
                    </div>
                    <div>
                      <div className="font-medium text-text">{user.username}</div>
                      <div className="text-sm text-text-muted">
                        {user.threads_count} тем · {user.comments_count} комм.
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-accent">
                    <TrendingUp size={16} />
                    <span className="font-bold">{user.reputation}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Activity by hour */}
        <Card>
          <div className="p-6">
            <h2 className="text-xl font-bold text-text mb-4">Активность по часам</h2>
            <div className="h-64 flex items-end gap-1">
              {data.engagement_by_hour.map((hour) => {
                const maxValue = Math.max(...data.engagement_by_hour.map(h => h.activity_count))
                const height = (hour.activity_count / maxValue) * 100
                return (
                  <div key={hour.hour} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-accent/20 hover:bg-accent/30 rounded-t transition-all cursor-pointer relative group"
                      style={{ height: `${height}%`, minHeight: hour.activity_count > 0 ? '4px' : '0' }}
                      title={`${hour.hour}:00 - ${hour.activity_count} активностей`}
                    />
                    <div className="text-xs text-text-muted">{hour.hour}</div>
                  </div>
                )
              })}
            </div>
            <div className="text-xs text-text-muted text-center mt-2">Час дня (UTC)</div>
          </div>
        </Card>
      </div>
    </div>
  )
}
