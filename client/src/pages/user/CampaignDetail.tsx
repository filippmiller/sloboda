import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Heart, Users, TrendingUp, Share2, ArrowLeft, Copy } from 'lucide-react'
import axios from '@/lib/axios'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ROUTES } from '@/config/routes'
import { toast } from 'sonner'

interface Donation {
  id: number
  donor_name: string | null
  amount: number
  message: string | null
  is_anonymous: boolean
  created_at: string
}

interface CampaignDetail {
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
  donations: Donation[]
}

export default function CampaignDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [showDonateModal, setShowDonateModal] = useState(false)

  const fetchCampaign = async () => {
    try {
      setLoading(true)
      const response = await axios.get(`/user/campaigns/${id}`)
      setCampaign(response.data.data)
    } catch (error) {
      console.error('Failed to fetch campaign:', error)
      toast.error('Не удалось загрузить сбор')
      navigate(ROUTES.CAMPAIGNS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCampaign()
  }, [id])

  const formatAmount = (amount: number) => {
    return new Intl.NumberFormat('ru-RU').format(amount)
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
    })
  }

  const formatRelativeDate = (date: string) => {
    const now = new Date()
    const past = new Date(date)
    const diffMs = now.getTime() - past.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Сегодня'
    if (diffDays === 1) return 'Вчера'
    if (diffDays < 7) return `${diffDays} дней назад`
    return formatDate(date)
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  const copyLink = () => {
    const url = window.location.href
    navigator.clipboard.writeText(url)
    toast.success('Ссылка скопирована')
  }

  const shareToTelegram = () => {
    if (!campaign) return
    const url = window.location.href
    const text = `${campaign.title} - Поддержите сбор на СЛОБОДЕ`
    window.open(`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(text)}`, '_blank')
  }

  const shareToVK = () => {
    if (!campaign) return
    const url = window.location.href
    window.open(`https://vk.com/share.php?url=${encodeURIComponent(url)}`, '_blank')
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="h-96 animate-pulse bg-bg-card/50" />
      </div>
    )
  }

  if (!campaign) return null

  const percentage = Math.min(100, (campaign.current_amount / campaign.goal_amount) * 100)

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(ROUTES.CAMPAIGNS)}
        className="flex items-center gap-2 text-text-secondary hover:text-text transition-colors"
      >
        <ArrowLeft size={18} />
        Назад к сборам
      </button>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card padding="lg">
            <div className="flex items-center gap-3 mb-6">
              {campaign.user_avatar ? (
                <img
                  src={campaign.user_avatar}
                  alt={campaign.user_name}
                  className="w-12 h-12 rounded-full object-cover"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-medium">
                  {getInitials(campaign.user_name)}
                </div>
              )}
              <div>
                <p className="font-medium text-text">{campaign.user_name}</p>
                <p className="text-sm text-text-tertiary">
                  Создано {formatDate(campaign.created_at)}
                </p>
              </div>
            </div>

            <h1 className="text-3xl font-display font-bold text-text mb-6">
              {campaign.title}
            </h1>

            <div className="mb-8">
              <div className="h-4 bg-bg-elevated rounded-full overflow-hidden mb-3">
                <div
                  className="h-full bg-gradient-to-r from-accent to-[#a82e12] transition-all duration-300"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-3xl font-display font-bold text-accent">
                    {formatAmount(campaign.current_amount)} ₽
                  </p>
                  <p className="text-sm text-text-tertiary">
                    из {formatAmount(campaign.goal_amount)} ₽ ({percentage.toFixed(0)}%)
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-text">{campaign.donation_count}</p>
                  <p className="text-sm text-text-tertiary">поддержали</p>
                </div>
              </div>
            </div>

            <div className="prose prose-invert max-w-none mb-6">
              <p className="text-text-secondary whitespace-pre-wrap">{campaign.description}</p>
            </div>

            {campaign.end_date && (
              <div className="flex items-center gap-2 text-text-secondary mb-6">
                <TrendingUp size={18} />
                <span>Сбор завершится {formatDate(campaign.end_date)}</span>
              </div>
            )}
          </Card>

          {campaign.donations && campaign.donations.length > 0 && (
            <Card padding="lg">
              <h2 className="text-xl font-display font-bold text-text mb-4">
                Поддержали ({campaign.donations.length})
              </h2>
              <div className="space-y-3">
                {campaign.donations.map(donation => (
                  <div key={donation.id} className="p-4 rounded-lg bg-bg-elevated">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className="font-medium text-text">
                          {donation.is_anonymous ? 'Аноним' : (donation.donor_name || 'Аноним')}
                        </p>
                        <p className="text-sm text-text-tertiary">
                          {formatRelativeDate(donation.created_at)}
                        </p>
                      </div>
                      <p className="font-bold text-accent">{formatAmount(donation.amount)} ₽</p>
                    </div>
                    {donation.message && !donation.is_anonymous && (
                      <p className="text-sm text-text-secondary">{donation.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card padding="lg">
            <Button
              variant="primary"
              size="lg"
              className="w-full mb-4"
              onClick={() => setShowDonateModal(true)}
            >
              <Heart size={20} />
              Поддержать
            </Button>

            <div className="space-y-2">
              <p className="text-sm text-text-secondary">Поделиться:</p>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={copyLink} className="flex-1">
                  <Copy size={16} />
                  Копировать
                </Button>
                <Button variant="secondary" size="sm" onClick={shareToTelegram}>
                  <Share2 size={16} />
                  TG
                </Button>
                <Button variant="secondary" size="sm" onClick={shareToVK}>
                  <Share2 size={16} />
                  VK
                </Button>
              </div>
            </div>
          </Card>

          <Card padding="md">
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-text-tertiary">Собрано</span>
                <span className="font-medium text-text">{percentage.toFixed(0)}%</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-text-tertiary">Участников</span>
                <span className="font-medium text-text">{campaign.donation_count}</span>
              </div>
              {campaign.end_date && (
                <div className="flex items-center justify-between">
                  <span className="text-text-tertiary">Завершение</span>
                  <span className="font-medium text-text">{formatDate(campaign.end_date)}</span>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>

      {showDonateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <Card padding="lg" className="max-w-md w-full">
            <h3 className="text-xl font-display font-bold text-text mb-4">Поддержать сбор</h3>
            <p className="text-text-secondary mb-6">
              Функция приёма платежей находится в разработке. Скоро здесь можно будет поддержать сбор.
            </p>
            <Button variant="primary" onClick={() => setShowDonateModal(false)} className="w-full">
              Понятно
            </Button>
          </Card>
        </div>
      )}
    </div>
  )
}
