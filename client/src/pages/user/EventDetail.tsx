import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Calendar, MapPin, Users, Download, ArrowLeft } from 'lucide-react'
import api from '@/services/api'
import Button from '@/components/ui/Button'
import Card from '@/components/ui/Card'
import { ROUTES } from '@/config/routes'
import { toast } from 'sonner'

interface Attendee {
  id: number
  name: string
  avatar_url: string | null
  status: string
  rsvp_date: string
}

interface EventDetail {
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
  user_rsvp_status?: string
  attendees: Attendee[]
  created_by: number
}

const eventTypeLabels: Record<string, string> = {
  meetup: 'Встреча',
  workshop: 'Мастер-класс',
  workday: 'Субботник',
  webinar: 'Вебинар'
}

export default function EventDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [event, setEvent] = useState<EventDetail | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchEvent = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/user/events/${id}`)
      setEvent(response.data.data)
    } catch (error) {
      console.error('Failed to fetch event:', error)
      toast.error('Не удалось загрузить событие')
      navigate(ROUTES.EVENTS)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchEvent()
  }, [id])

  const handleRSVP = async (status: string) => {
    try {
      await api.post(`/user/events/${id}/rsvp`, { status })
      toast.success(status === 'going' ? 'Вы записаны на событие!' : 'Статус обновлён')
      fetchEvent()
    } catch (error) {
      console.error('Failed to RSVP:', error)
      toast.error('Не удалось обновить статус')
    }
  }

  const downloadICS = async () => {
    try {
      const response = await api.get(`/user/events/${id}/ical`, {
        responseType: 'blob'
      })
      const url = window.URL.createObjectURL(new Blob([response.data]))
      const link = document.createElement('a')
      link.href = url
      link.setAttribute('download', `event-${id}.ics`)
      document.body.appendChild(link)
      link.click()
      link.remove()
      toast.success('Календарь загружен')
    } catch (error) {
      console.error('Failed to download ICS:', error)
      toast.error('Не удалось загрузить календарь')
    }
  }

  const formatDate = (date: string) => {
    return new Date(date).toLocaleDateString('ru-RU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Card className="h-96 animate-pulse bg-bg-card/50">
          <div />
        </Card>
      </div>
    )
  }

  if (!event) return null

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate(ROUTES.EVENTS)}
        className="flex items-center gap-2 text-text-secondary hover:text-text transition-colors"
      >
        <ArrowLeft size={18} />
        Назад к событиям
      </button>

      <Card padding="lg">
        <div className="flex items-start justify-between mb-4">
          <span className="px-3 py-1.5 rounded-lg text-sm font-medium bg-accent/10 text-accent border border-accent/20">
            {eventTypeLabels[event.event_type] || event.event_type}
          </span>
          {event.user_rsvp_status && (
            <span className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              event.user_rsvp_status === 'going'
                ? 'bg-green-900/30 text-green-400 border border-green-900/50'
                : 'bg-yellow-900/30 text-yellow-400 border border-yellow-900/50'
            }`}>
              {event.user_rsvp_status === 'going' ? 'Вы идёте' : 'Вы возможно пойдёте'}
            </span>
          )}
        </div>

        <h1 className="text-3xl font-display font-bold text-text mb-6">
          {event.title}
        </h1>

        <div className="grid md:grid-cols-3 gap-4 mb-8">
          <div className="flex items-start gap-3">
            <Calendar size={20} className="text-accent mt-1 flex-shrink-0" />
            <div>
              <p className="text-sm text-text-tertiary mb-1">Дата и время</p>
              <p className="text-text">{formatDate(event.start_date)}</p>
            </div>
          </div>
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin size={20} className="text-accent mt-1 flex-shrink-0" />
              <div>
                <p className="text-sm text-text-tertiary mb-1">Место</p>
                <p className="text-text">{event.location}</p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Users size={20} className="text-accent mt-1 flex-shrink-0" />
            <div>
              <p className="text-sm text-text-tertiary mb-1">Участники</p>
              <p className="text-text">{event.rsvp_going} идёт{event.rsvp_maybe > 0 && `, ${event.rsvp_maybe} возможно`}</p>
            </div>
          </div>
        </div>

        {event.description && (
          <div className="mb-8">
            <h2 className="text-xl font-display font-bold text-text mb-3">Описание</h2>
            <p className="text-text-secondary whitespace-pre-wrap">{event.description}</p>
          </div>
        )}

        <div className="flex gap-3 mb-8">
          {event.user_rsvp_status !== 'going' && (
            <Button onClick={() => handleRSVP('going')} variant="primary">
              Пойду
            </Button>
          )}
          {event.user_rsvp_status !== 'maybe' && (
            <Button onClick={() => handleRSVP('maybe')} variant="secondary">
              Возможно
            </Button>
          )}
          {event.user_rsvp_status && (
            <Button onClick={() => handleRSVP('not_going')} variant="ghost">
              Не пойду
            </Button>
          )}
          <Button onClick={downloadICS} variant="ghost">
            <Download size={18} />
            В календарь
          </Button>
        </div>

        {event.attendees && event.attendees.length > 0 && (
          <div>
            <h2 className="text-xl font-display font-bold text-text mb-4">
              Участники ({event.attendees.filter(a => a.status === 'going').length})
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {event.attendees
                .filter(a => a.status === 'going')
                .map(attendee => (
                  <div key={attendee.id} className="flex items-center gap-3 p-3 rounded-lg bg-bg-elevated">
                    {attendee.avatar_url ? (
                      <img
                        src={attendee.avatar_url}
                        alt={attendee.name}
                        className="w-10 h-10 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent font-medium text-sm">
                        {getInitials(attendee.name)}
                      </div>
                    )}
                    <div>
                      <p className="text-text font-medium">{attendee.name}</p>
                      <p className="text-xs text-text-tertiary">
                        {new Date(attendee.rsvp_date).toLocaleDateString('ru-RU', {
                          day: 'numeric',
                          month: 'short'
                        })}
                      </p>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  )
}
