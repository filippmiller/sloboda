import { useState } from 'react'
import { X } from 'lucide-react'
import axios from '@/lib/axios'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { toast } from 'sonner'

interface CreateEventModalProps {
  onClose: () => void
  onEventCreated: () => void
}

export default function CreateEventModal({ onClose, onEventCreated }: CreateEventModalProps) {
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    location: '',
    eventType: 'meetup',
    startDate: '',
    endDate: '',
    maxAttendees: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title || !formData.startDate) {
      toast.error('Заполните название и дату события')
      return
    }

    try {
      setLoading(true)
      await axios.post('/user/events', {
        title: formData.title,
        description: formData.description || undefined,
        location: formData.location || undefined,
        eventType: formData.eventType,
        startDate: formData.startDate,
        endDate: formData.endDate || undefined,
        maxAttendees: formData.maxAttendees ? parseInt(formData.maxAttendees) : undefined
      })
      onEventCreated()
    } catch (error: any) {
      console.error('Failed to create event:', error)
      toast.error(error.response?.data?.error || 'Не удалось создать событие')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-bg-card rounded-xl border border-border shadow-[var(--shadow-card)] max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-border">
          <h2 className="text-xl font-display font-bold text-text">Создать событие</h2>
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
              placeholder="Встреча сообщества"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Тип события
            </label>
            <select
              value={formData.eventType}
              onChange={(e) => setFormData({ ...formData, eventType: e.target.value })}
              className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
            >
              <option value="meetup">Встреча</option>
              <option value="workshop">Мастер-класс</option>
              <option value="workday">Субботник</option>
              <option value="webinar">Вебинар</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Описание
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Расскажите о событии..."
              rows={4}
              className="w-full px-4 py-2 bg-bg-elevated border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Место проведения
            </label>
            <Input
              value={formData.location}
              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
              placeholder="Адрес или ссылка на видеозвонок"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Начало <span className="text-accent">*</span>
              </label>
              <Input
                type="datetime-local"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text mb-2">
                Окончание
              </label>
              <Input
                type="datetime-local"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-text mb-2">
              Макс. участников
            </label>
            <Input
              type="number"
              value={formData.maxAttendees}
              onChange={(e) => setFormData({ ...formData, maxAttendees: e.target.value })}
              placeholder="Без ограничений"
              min="1"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <Button type="submit" variant="primary" loading={loading} className="flex-1">
              Создать
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
