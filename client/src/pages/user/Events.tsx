import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Calendar, MapPin, Users, Plus, Filter } from 'lucide-react'
import axios from '@/lib/axios'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ROUTES } from '@/config/routes'
import CreateEventModal from '@/components/CreateEventModal'
import { toast } from 'sonner'

interface Event {
  id: number
  title: string
  description: string
  location: string
  event_type: string
  start_date: string
  end_date?: string
  max_attendees?: number
  creator_name: string
  creator_avatar: string
  rsvp_going: number
  rsvp_maybe: number
  rsvp_total: number
  user_rsvp_status?: string
  status: string
}

const eventTypeLabels: Record<string, string> = {
  meetup: 'Встреча',
  workshop: 'Мастер-класс',
  workday: 'Субботник',
  webinar: 'Вебинар'
}

const eventTypeColors: Record<string, string> = {
  meetup: 'bg-blue-900/30 text-blue-400 border-blue-900/50',
  workshop: 'bg-purple-900/30 text-purple-400 border-purple-900/50',
  workday: 'bg-green-900/30 text-green-400 border-green-900/50',
  webinar: 'bg-orange-900/30 text-orange-400 border-orange-900/50'
}

export default function Events() {
  const [events, setEvents] = useState<Event[]>([])
  const [filter, setFilter] = useState<'upcoming' | 'my-rsvps'>('upcoming')
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)

  const fetchEvents = async () => {
    try {
      setLoading(true)
      const endpoint = filter === 'my-rsvps'
        ? '/user/events/my-rsvps'
        : '/user/events?status=upcoming'

      const response = await axios.get(endpoint)
      setEvents(response.data.data)
    } catch (error) {
      console.error('Failed to fetch events:', error)
      toast.error('Не удалось загрузить события')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvents()
  }, [filter])

  const handleRSVP = async (eventId: number, status: string) => {
    try {
      await axios.post(`/user/events/${eventId}/rsvp`, { status })
      toast.success(status === 'going' ? 'Вы записаны на событие!' : 'Статус обновлён')
      fetchEvents()
    } catch (error) {
      console.error('Failed to RSVP:', error)
      toast.error('Не удалось обновить статус')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const handleEventCreated = () => {
    setShowCreateModal(false)
    fetchEvents()
    toast.success('Событие создано!')
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold text-text">События</h1>
        <Button onClick={() => setShowCreateModal(true)} size="md">
          <Plus size={18} />
          Создать событие
        </Button>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setFilter('upcoming')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'upcoming'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:text-text'
          }`}
        >
          Предстоящие
        </button>
        <button
          onClick={() => setFilter('my-rsvps')}
          className={`px-4 py-2 rounded-lg font-medium transition-all ${
            filter === 'my-rsvps'
              ? 'bg-accent text-white'
              : 'bg-bg-card text-text-secondary hover:text-text'
          }`}
        >
          Мои события
        </button>
      </div>

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map(i => (
            <Card key={i} className="h-64 animate-pulse bg-bg-card/50" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <Card padding="lg" className="text-center">
          <Calendar size={48} className="mx-auto mb-4 text-text-tertiary" />
          <p className="text-text-secondary">
            {filter === 'my-rsvps'
              ? 'У вас пока нет запланированных событий'
              : 'Предстоящих событий пока нет'}
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {events.map(event => (
            <Card key={event.id} variant="default" padding="md" className="flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <span className={`px-2 py-1 rounded text-xs font-medium border ${eventTypeColors[event.event_type] || 'bg-bg-elevated text-text border-border'}`}>
                  {eventTypeLabels[event.event_type] || event.event_type}
                </span>
                {event.user_rsvp_status && (
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    event.user_rsvp_status === 'going'
                      ? 'bg-green-900/30 text-green-400'
                      : 'bg-yellow-900/30 text-yellow-400'
                  }`}>
                    {event.user_rsvp_status === 'going' ? 'Пойду' : 'Возможно'}
                  </span>
                )}
              </div>

              <h3 className="font-display font-bold text-lg text-text mb-2 line-clamp-2">
                {event.title}
              </h3>

              {event.description && (
                <p className="text-sm text-text-secondary mb-4 line-clamp-2">
                  {event.description}
                </p>
              )}

              <div className="space-y-2 mb-4 text-sm text-text-secondary">
                <div className="flex items-center gap-2">
                  <Calendar size={16} />
                  <span>{formatDate(event.start_date)}</span>
                </div>
                {event.location && (
                  <div className="flex items-center gap-2">
                    <MapPin size={16} />
                    <span className="line-clamp-1">{event.location}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>{event.rsvp_going} идёт{event.rsvp_maybe > 0 && `, ${event.rsvp_maybe} возможно`}</span>
                </div>
              </div>

              <div className="mt-auto pt-4 border-t border-border flex gap-2">
                {event.user_rsvp_status !== 'going' && (
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={() => handleRSVP(event.id, 'going')}
                    className="flex-1"
                  >
                    Пойду
                  </Button>
                )}
                {event.user_rsvp_status !== 'maybe' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleRSVP(event.id, 'maybe')}
                    className="flex-1"
                  >
                    Возможно
                  </Button>
                )}
                <Link to={ROUTES.EVENT_DETAIL.replace(':id', event.id.toString())}>
                  <Button size="sm" variant="ghost">Подробнее</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}

      {showCreateModal && (
        <CreateEventModal
          onClose={() => setShowCreateModal(false)}
          onEventCreated={handleEventCreated}
        />
      )}
    </div>
  )
}
