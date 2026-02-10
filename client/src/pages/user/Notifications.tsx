import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { formatDistanceToNow } from 'date-fns'
import { useDateLocale } from '@/hooks/useDateLocale'
import {
  Bell,
  CheckCircle,
  XCircle,
  Info,
  Loader2,
  CheckCheck,
} from 'lucide-react'
import api from '@/services/api'
import type { Notification } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const typeIcons: Record<string, typeof Info> = {
  submission_approved: CheckCircle,
  submission_rejected: XCircle,
  info: Info,
}

const typeColors: Record<string, string> = {
  submission_approved: 'text-green',
  submission_rejected: 'text-red-400',
  info: 'text-blue-400',
}

export default function Notifications() {
  const navigate = useNavigate()
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [markingAll, setMarkingAll] = useState(false)

  const fetchNotifications = async () => {
    setLoading(true)
    try {
      const res = await api.get('/user/notifications')
      setNotifications(res.data.data?.notifications ?? [])
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchNotifications()
  }, [])

  const handleMarkAllRead = async () => {
    setMarkingAll(true)
    try {
      await api.post('/user/notifications/read-all')
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })))
    } catch {
      // Non-critical
    } finally {
      setMarkingAll(false)
    }
  }

  const handleNotificationClick = async (notification: Notification) => {
    if (!notification.is_read) {
      try {
        await api.post(`/user/notifications/${notification.id}/read`)
        setNotifications((prev) =>
          prev.map((n) =>
            n.id === notification.id ? { ...n, is_read: true } : n,
          ),
        )
      } catch {
        // Non-critical
      }
    }
    if (notification.link) {
      navigate(notification.link)
    }
  }

  const hasUnread = notifications.some((n) => !n.is_read)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold font-display">{t('notifications.title')}</h1>
        {hasUnread && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleMarkAllRead}
            loading={markingAll}
          >
            <CheckCheck size={16} />
            {t('notifications.markAllRead')}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-text-muted" size={24} />
        </div>
      ) : notifications.length > 0 ? (
        <div className="space-y-2">
          {notifications.map((notification) => {
            const Icon = typeIcons[notification.type] ?? Info
            const iconColor = typeColors[notification.type] ?? 'text-blue-400'

            return (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`
                  flex items-start gap-3 p-4 rounded-xl border transition-colors cursor-pointer
                  ${
                    notification.is_read
                      ? 'bg-bg-card border-border hover:border-border-hover'
                      : 'bg-bg-card border-l-2 border-l-accent border-t border-r border-b border-border hover:border-border-hover'
                  }
                `}
              >
                <div className={`mt-0.5 flex-shrink-0 ${iconColor}`}>
                  <Icon size={18} />
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className={`text-sm leading-snug ${
                      notification.is_read
                        ? 'text-text-secondary'
                        : 'text-text font-medium'
                    }`}
                  >
                    {notification.title}
                  </p>
                  {notification.message && (
                    <p className="text-xs text-text-muted mt-1 line-clamp-2">
                      {notification.message}
                    </p>
                  )}
                  <time className="text-xs text-text-muted mt-1 block">
                    {formatDistanceToNow(new Date(notification.created_at), {
                      addSuffix: true,
                      locale: dateLocale,
                    })}
                  </time>
                </div>
                {!notification.is_read && (
                  <div className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-2" />
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12 space-y-3">
            <Bell className="text-text-muted mx-auto" size={40} />
            <p className="text-text-secondary text-sm">{t('notifications.empty')}</p>
          </div>
        </Card>
      )}
    </div>
  )
}
