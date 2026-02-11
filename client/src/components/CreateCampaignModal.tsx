import { useState } from 'react'
import { X } from 'lucide-react'
import axios from '@/lib/axios'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { toast } from 'sonner'

interface CreateCampaignModalProps {
  onClose: () => void
  onCampaignCreated: () => void
}

export default function CreateCampaignModal({ onClose, onCampaignCreated }: CreateCampaignModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    goalAmount: '',
    endDate: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title || !formData.description || !formData.goalAmount) {
      toast.error('Заполните все обязательные поля')
      return
    }

    if (formData.title.length > 100) {
      toast.error('Название должно быть не более 100 символов')
      return
    }

    if (formData.description.length > 1000) {
      toast.error('Описание должно быть не более 1000 символов')
      return
    }

    const amount = parseInt(formData.goalAmount)
    if (isNaN(amount) || amount < 100) {
      toast.error('Цель должна быть не менее 100 рублей')
      return
    }

    try {
      setLoading(true)
      await axios.post('/user/campaigns', {
        title: formData.title,
        description: formData.description,
        goalAmount: amount,
        endDate: formData.endDate || undefined
      })
      onCampaignCreated()
    } catch (error: any) {
      console.error('Failed to create campaign:', error)
      toast.error(error.response?.data?.error || 'Не удалось создать сбор')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-bg-card rounded-xl border border-border shadow-[var(--shadow-card)] max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-display font-bold text-text">Создать сбор</h2>
          <button
            onClick={onClose}
            className="text-text-tertiary hover:text-text transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Название <span className="text-accent">*</span>
            </label>
            <Input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              placeholder="Помогите построить экодом"
              maxLength={100}
              required
            />
            <p className="text-xs text-text-tertiary mt-1">
              {formData.title.length}/100 символов
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Описание <span className="text-accent">*</span>
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Расскажите, на что пойдут средства..."
              rows={6}
              maxLength={1000}
              required
              className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            />
            <p className="text-xs text-text-tertiary mt-1">
              {formData.description.length}/1000 символов
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Цель сбора (₽) <span className="text-accent">*</span>
            </label>
            <Input
              type="number"
              value={formData.goalAmount}
              onChange={(e) => setFormData({ ...formData, goalAmount: e.target.value })}
              placeholder="50000"
              min="100"
              step="100"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Дата завершения (опционально)
            </label>
            <Input
              type="date"
              value={formData.endDate}
              onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              min={new Date().toISOString().split('T')[0]}
            />
          </div>

          <div className="bg-bg-elevated border border-border rounded-lg p-4">
            <p className="text-sm text-text-secondary">
              <strong className="text-text">Важно:</strong> Ваш персональный сбор будет виден всем участникам сообщества.
              Убедитесь, что описание понятно объясняет, на что пойдут средства.
            </p>
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="primary" loading={loading} className="flex-1">
              Создать сбор
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Отмена
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
