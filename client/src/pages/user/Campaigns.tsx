import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Heart, Plus, TrendingUp, Users } from 'lucide-react'
import api from '@/services/api'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ROUTES } from '@/config/routes'
import CreateCampaignModal from '@/components/CreateCampaignModal'
import { toast } from 'sonner'

interface Campaign {
  id: number
  user_id: number
  title: string
  description: string
  goal_amount: number
  current_amount: number
  end_date: string | null
  status: string
  user_name: string
  user_avatar: string | null
  donation_count: number
  created_at: string
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [view, setView] = useState<'all' | 'my'>('all')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchCampaigns = async () => {
    try {
      setLoading(true)
      const endpoint = view === 'my' ? '/user/campaigns/my' : '/user/campaigns'
      const response = await api.get(endpoint)
      setCampaigns(response.data.data)
    } catch (error) {
      console.error('Failed to fetch campaigns:', error)
      toast.error('Не удалось загрузить сборы')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaigns()
  }, [view])

  const handleCampaignCreated = () => {
    setShowCreateModal(false)
    setView('my')
    fetchCampaigns()
    toast.success('Сбор создан!')
  }

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long'
    })
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const truncate = (text: string, maxLength: number) => {
    if (text.length <= maxLength) return text
    return text.slice(0, maxLength) + '...'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-text">Персональные сборы</h1>
        <Button onClick={() => setShowCreateModal(true)} size="md">
          <Plus size={18} />
          Создать сбор
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setView('all')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            view === 'all'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:text-text'
          }`}
        >
          Все сборы
        </button>
        <button
          onClick={() => setView('my')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            view === 'my'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:text-text'
          }`}
        >
          Мои сборы
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-80 animate-pulse bg-bg-card/50">
              <div />
            </Card>
          ))}
        </div>
      ) : campaigns.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Heart size={48} className="mx-auto mb-4 text-text-tertiary" />
          <p className="text-text-secondary">
            {view === 'my'
              ? 'У вас пока нет активных сборов'
              : 'Активных сборов пока нет'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map(campaign => {
            const percentage = Math.min(100, (campaign.current_amount / campaign.goal_amount) * 100)
            return (
              <Card key={campaign.id} variant="default" padding="md" className="flex flex-col">
                <div className="flex items-center gap-3 mb-4">
                  {campaign.user_avatar ? (
                    <img
                      src={campaign.user_avatar}
                      alt={campaign.user_name}
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-medium text-sm">
                      {getInitials(campaign.user_name)}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-text truncate">{campaign.user_name}</p>
                    <p className="text-xs text-text-tertiary">
                      {formatDate(campaign.created_at)}
                    </p>
                  </div>
                </div>

                <h3 className="font-display font-bold text-lg text-text mb-2 line-clamp-2">
                  {campaign.title}
                </h3>

                <p className="text-sm text-text-secondary mb-4 line-clamp-3">
                  {truncate(campaign.description, 150)}
                </p>

                <div className="mb-4">
                  <div className="h-2 bg-bg-elevated rounded-full overflow-hidden mb-2">
                    <div
                      className="h-full bg-gradient-to-r from-accent to-[#a82e12] transition-all duration-300"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-bold text-accent">
                      {formatAmount(campaign.current_amount)} ₽
                    </span>
                    <span className="text-text-tertiary">
                      из {formatAmount(campaign.goal_amount)} ₽
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between text-sm text-text-secondary mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    <span>{campaign.donation_count} поддержали</span>
                  </div>
                  {campaign.end_date && (
                    <div className="flex items-center gap-2">
                      <TrendingUp size={16} />
                      <span>До {formatDate(campaign.end_date)}</span>
                    </div>
                  )}
                </div>

                <Link
                  to={ROUTES.CAMPAIGN_DETAIL.replace(':id', campaign.id.toString())}
                  className="mt-auto"
                >
                  <Button variant="primary" size="md" className="w-full">
                    Поддержать
                  </Button>
                </Link>
              </Card>
            )
          })}
        </div>
      )}

      {showCreateModal && (
        <CreateCampaignModal
          onClose={() => setShowCreateModal(false)}
          onCampaignCreated={handleCampaignCreated}
        />
      )}
    </div>
  )
}
