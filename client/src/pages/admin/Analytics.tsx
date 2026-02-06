import { useEffect, useState } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'
import type { AnalyticsOverview, TimeSeriesPoint, AnalyticsBreakdown } from '@/types'

const CHART_COLORS = ['#c23616', '#4a7c59', '#3b82f6', '#eab308', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316']

export default function Analytics() {
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null)
  const [timeseries, setTimeseries] = useState<TimeSeriesPoint[]>([])
  const [breakdown, setBreakdown] = useState<AnalyticsBreakdown | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [overviewRes, tsRes, bdRes] = await Promise.allSettled([
          adminApi.get('/analytics/overview'),
          adminApi.get('/analytics/timeseries', { params: { days: 30 } }),
          adminApi.get('/analytics/breakdown'),
        ])

        if (overviewRes.status === 'fulfilled') setOverview(overviewRes.value.data.data)
        if (tsRes.status === 'fulfilled') setTimeseries(tsRes.value.data.data ?? [])
        if (bdRes.status === 'fulfilled') setBreakdown(bdRes.value.data.data)
      } catch {
        toast.error('Ошибка загрузки аналитики')
      } finally {
        setLoading(false)
      }
    }

    fetchAll()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  const chartTimeseries = timeseries.map((p) => ({
    ...p,
    date: new Date(p.date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }),
  }))

  const tooltipStyle = {
    contentStyle: {
      background: '#141414',
      border: '1px solid #222222',
      borderRadius: '8px',
      color: '#e0e0e0',
      fontSize: '12px',
    },
  }

  return (
    <div>
      <h1 className="text-2xl font-bold font-display mb-6">Аналитика</h1>

      {/* Overview stats */}
      {overview && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <Card padding="md">
            <p className="text-sm text-text-secondary">Всего заявок</p>
            <p className="text-2xl font-bold font-display mt-1">{overview.total_registrations}</p>
          </Card>
          <Card padding="md">
            <p className="text-sm text-text-secondary">За неделю</p>
            <p className="text-2xl font-bold font-display mt-1">{overview.this_week}</p>
          </Card>
          <Card padding="md">
            <p className="text-sm text-text-secondary">За месяц</p>
            <p className="text-2xl font-bold font-display mt-1">{overview.this_month}</p>
          </Card>
        </div>
      )}

      {/* Registration trend */}
      <Card padding="md" className="mb-6">
        <h2 className="text-sm font-semibold font-display text-text mb-4">
          Динамика заявок (30 дней)
        </h2>
        {chartTimeseries.length === 0 ? (
          <p className="text-sm text-text-muted text-center py-8">Нет данных</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartTimeseries}>
              <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
              <XAxis
                dataKey="date"
                tick={{ fill: '#888888', fontSize: 11 }}
                stroke="#222222"
              />
              <YAxis
                tick={{ fill: '#888888', fontSize: 11 }}
                stroke="#222222"
                allowDecimals={false}
              />
              <Tooltip {...tooltipStyle} />
              <Line
                type="monotone"
                dataKey="count"
                name="Заявки"
                stroke="#c23616"
                strokeWidth={2}
                dot={{ fill: '#c23616', r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* Breakdowns */}
      {breakdown && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Participation (PieChart) */}
          {breakdown.participation && breakdown.participation.length > 0 && (
            <Card padding="md">
              <h2 className="text-sm font-semibold font-display text-text mb-4">
                Участие
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={breakdown.participation}
                    dataKey="count"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`}
                    labelLine={false}
                  >
                    {breakdown.participation.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip {...tooltipStyle} />
                </PieChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Motivation (BarChart) */}
          {breakdown.motivation && breakdown.motivation.length > 0 && (
            <Card padding="md">
              <h2 className="text-sm font-semibold font-display text-text mb-4">
                Мотивация
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={breakdown.motivation.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
                  <XAxis type="number" tick={{ fill: '#888888', fontSize: 11 }} stroke="#222222" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fill: '#888888', fontSize: 11 }}
                    stroke="#222222"
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" name="Кол-во" fill="#c23616" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Location (BarChart) */}
          {breakdown.location && breakdown.location.length > 0 && (
            <Card padding="md">
              <h2 className="text-sm font-semibold font-display text-text mb-4">
                Локации (топ 10)
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={breakdown.location.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
                  <XAxis type="number" tick={{ fill: '#888888', fontSize: 11 }} stroke="#222222" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fill: '#888888', fontSize: 11 }}
                    stroke="#222222"
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" name="Кол-во" fill="#4a7c59" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}

          {/* Skills (BarChart) */}
          {breakdown.skills && breakdown.skills.length > 0 && (
            <Card padding="md">
              <h2 className="text-sm font-semibold font-display text-text mb-4">
                Навыки
              </h2>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={breakdown.skills.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="#222222" />
                  <XAxis type="number" tick={{ fill: '#888888', fontSize: 11 }} stroke="#222222" allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="label"
                    width={120}
                    tick={{ fill: '#888888', fontSize: 11 }}
                    stroke="#222222"
                  />
                  <Tooltip {...tooltipStyle} />
                  <Bar dataKey="count" name="Кол-во" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
