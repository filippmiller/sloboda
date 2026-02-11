import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import api from '@/services/api'
import { Loader2, Award, CheckCircle, Lock } from 'lucide-react'

interface Badge {
  id: number
  name: string
  description: string
  icon: string
  category: string
  earned: boolean
  earned_at?: string
}

export default function Badges() {
  const { t } = useTranslation()
  const [badges, setBadges] = useState<Badge[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadBadges()
  }, [])

  const loadBadges = async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await api.get('/user/badges/all')
      setBadges(res.data.data || [])
    } catch (err: any) {
      console.error('Error loading badges:', err)
      setError('Failed to load badges')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Award size={48} className="text-text-muted" />
        <p className="text-text-secondary">{error}</p>
      </div>
    )
  }

  const earnedBadges = badges.filter((b) => b.earned)
  const lockedBadges = badges.filter((b) => !b.earned)

  const categoryLabels: Record<string, string> = {
    milestone: 'Достижения',
    contribution: 'Вклад',
    engagement: 'Активность',
  }

  const groupByCategory = (badgeList: Badge[]) => {
    const grouped: Record<string, Badge[]> = {}
    badgeList.forEach((badge) => {
      if (!grouped[badge.category]) {
        grouped[badge.category] = []
      }
      grouped[badge.category].push(badge)
    })
    return grouped
  }

  const earnedByCategory = groupByCategory(earnedBadges)
  const lockedByCategory = groupByCategory(lockedBadges)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Награды</h1>
          <p className="text-text-secondary mt-1">
            Получено {earnedBadges.length} из {badges.length} наград
          </p>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="bg-bg-card border border-border rounded-lg p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-text">Прогресс</span>
          <span className="text-sm font-medium text-accent">
            {Math.round((earnedBadges.length / badges.length) * 100)}%
          </span>
        </div>
        <div className="w-full h-2 bg-bg-elevated rounded-full overflow-hidden">
          <div
            className="h-full bg-accent transition-all duration-500"
            style={{ width: `${(earnedBadges.length / badges.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Recently Earned */}
      {earnedBadges.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold font-display text-text mb-4 flex items-center gap-2">
            <CheckCircle size={20} className="text-accent" />
            Недавно получены
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {earnedBadges.slice(0, 3).map((badge) => (
              <BadgeCard key={badge.id} badge={badge} earned={true} />
            ))}
          </div>
        </div>
      )}

      {/* Earned Badges by Category */}
      {Object.keys(earnedByCategory).length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold font-display text-text mb-4">
            Полученные награды
          </h2>
          {Object.entries(earnedByCategory).map(([category, categoryBadges]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
                {categoryLabels[category] || category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryBadges.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} earned={true} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Locked Badges */}
      {lockedBadges.length > 0 && (
        <div className="bg-bg-card border border-border rounded-lg p-6">
          <h2 className="text-xl font-semibold font-display text-text mb-4 flex items-center gap-2">
            <Lock size={20} className="text-text-muted" />
            Еще не получены
          </h2>
          {Object.entries(lockedByCategory).map(([category, categoryBadges]) => (
            <div key={category} className="mb-6 last:mb-0">
              <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">
                {categoryLabels[category] || category}
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryBadges.map((badge) => (
                  <BadgeCard key={badge.id} badge={badge} earned={false} />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BadgeCard({ badge, earned }: { badge: Badge; earned: boolean }) {
  return (
    <div
      className={`
        relative flex flex-col items-center p-4 rounded-lg border-2 transition-all
        ${
          earned
            ? 'bg-accent/5 border-accent/30 hover:border-accent/50'
            : 'bg-bg-elevated border-border opacity-50 grayscale hover:opacity-60'
        }
      `}
    >
      {earned && (
        <div className="absolute top-2 right-2">
          <CheckCircle size={16} className="text-accent" />
        </div>
      )}
      {!earned && (
        <div className="absolute top-2 right-2">
          <Lock size={16} className="text-text-muted" />
        </div>
      )}
      <div className="text-5xl mb-2">{badge.icon}</div>
      <h3 className="text-center font-semibold text-text mb-1">{badge.name}</h3>
      <p className="text-sm text-center text-text-secondary">{badge.description}</p>
      {earned && badge.earned_at && (
        <p className="text-xs text-text-muted mt-2">
          {new Date(badge.earned_at).toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          })}
        </p>
      )}
    </div>
  )
}
