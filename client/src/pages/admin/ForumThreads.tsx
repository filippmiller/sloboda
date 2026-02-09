import { useState, useEffect } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { MessageSquare, Eye, MessageCircle, Pin, Lock, Trash2, Edit, Search, Shield, AlertTriangle, BarChart3 } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Card from '@/components/ui/Card'
import axios from 'axios'
import { toast } from 'sonner'
import { formatDistanceToNow } from 'date-fns'
import { ru } from 'date-fns/locale'

interface Thread {
  id: number
  title: string
  body: string
  author_username: string
  view_count: number
  comment_count: number
  is_pinned: boolean
  is_locked: boolean
  created_at: string
  last_activity_at: string
}

export default function ForumThreads() {
  const navigate = useNavigate()
  const [threads, setThreads] = useState<Thread[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState<'recent' | 'popular' | 'oldest'>('recent')
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)

  useEffect(() => {
    fetchThreads()
  }, [sortBy, page])

  const fetchThreads = async () => {
    try {
      setLoading(true)
      const response = await axios.get('/api/forum/threads', {
        params: { page, limit: 20, sortBy, search: searchQuery || undefined }
      })
      setThreads(response.data.threads)
      setTotalPages(response.data.pagination.totalPages)
    } catch (error) {
      console.error('Error fetching threads:', error)
      toast.error('Не удалось загрузить темы')
    } finally {
      setLoading(false)
    }
  }

  const handleTogglePin = async (threadId: number, isPinned: boolean) => {
    try {
      await axios.patch(`/api/forum/moderation/threads/${threadId}/pin`, {
        is_pinned: !isPinned
      })
      toast.success(isPinned ? 'Тема откреплена' : 'Тема закреплена')
      fetchThreads()
    } catch (error) {
      toast.error('Ошибка при изменении статуса')
    }
  }

  const handleToggleLock = async (threadId: number, isLocked: boolean) => {
    try {
      await axios.patch(`/api/forum/moderation/threads/${threadId}/lock`, {
        is_locked: !isLocked
      })
      toast.success(isLocked ? 'Тема разблокирована' : 'Тема заблокирована')
      fetchThreads()
    } catch (error) {
      toast.error('Ошибка при изменении статуса')
    }
  }

  const handleDeleteThread = async (threadId: number) => {
    if (!confirm('Вы уверены, что хотите удалить эту тему?')) return

    try {
      await axios.delete(`/api/forum/moderation/threads/${threadId}`)
      toast.success('Тема удалена')
      fetchThreads()
    } catch (error) {
      toast.error('Ошибка при удалении темы')
    }
  }

  const handleSearch = () => {
    setPage(1)
    fetchThreads()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold font-display text-text">Форум</h1>
          <p className="text-text-secondary mt-1">
            Управление темами и обсуждениями
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MessageSquare className="text-accent" size={32} />
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <Link
          to={ROUTES.ADMIN_FORUM}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-accent/10 text-accent border-b-2 border-accent"
        >
          <MessageSquare size={16} className="inline mr-2" />
          Темы
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_ROLES}
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <Shield size={16} className="inline mr-2" />
          Роли
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_MODERATION}
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <AlertTriangle size={16} className="inline mr-2" />
          Модерация
        </Link>
        <Link
          to={ROUTES.ADMIN_FORUM_ANALYTICS}
          className="px-4 py-2 rounded-lg text-sm font-medium text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          <BarChart3 size={16} className="inline mr-2" />
          Аналитика
        </Link>
      </div>

      <Card>
        <div className="p-6 space-y-4">
          <div className="flex gap-3">
            <div className="flex-1">
              <Input
                placeholder="Поиск по заголовку или содержимому..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              />
            </div>
            <Button onClick={handleSearch}>
              <Search size={18} />
              Найти
            </Button>
          </div>

          <div className="flex gap-2">
            <Button
              variant={sortBy === 'recent' ? 'primary' : 'secondary'}
              onClick={() => setSortBy('recent')}
            >
              Последние
            </Button>
            <Button
              variant={sortBy === 'popular' ? 'primary' : 'secondary'}
              onClick={() => setSortBy('popular')}
            >
              Популярные
            </Button>
            <Button
              variant={sortBy === 'oldest' ? 'primary' : 'secondary'}
              onClick={() => setSortBy('oldest')}
            >
              Старые
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-text-muted">
            Загрузка...
          </div>
        ) : threads.length === 0 ? (
          <div className="p-12 text-center text-text-muted">
            Темы не найдены
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-t border-b border-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Тема
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Автор
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Статистика
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Последняя активность
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-text-secondary uppercase tracking-wider">
                    Действия
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {threads.map((thread) => (
                  <tr key={thread.id} className="hover:bg-bg-elevated transition-colors">
                    <td className="px-6 py-4">
                      <div className="flex items-start gap-2">
                        {thread.is_pinned && (
                          <Pin size={14} className="text-accent mt-1 flex-shrink-0" />
                        )}
                        {thread.is_locked && (
                          <Lock size={14} className="text-yellow-500 mt-1 flex-shrink-0" />
                        )}
                        <div>
                          <div className="font-medium text-text line-clamp-2">
                            {thread.title}
                          </div>
                          <div className="text-sm text-text-muted line-clamp-1 mt-1">
                            {thread.body}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {thread.author_username || 'Аноним'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-sm text-text-muted">
                        <div className="flex items-center gap-1">
                          <Eye size={14} />
                          {thread.view_count}
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageCircle size={14} />
                          {thread.comment_count}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-text-secondary">
                      {formatDistanceToNow(new Date(thread.last_activity_at), {
                        addSuffix: true,
                        locale: ru
                      })}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleTogglePin(thread.id, thread.is_pinned)}
                          className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text transition-colors"
                          title={thread.is_pinned ? 'Открепить' : 'Закрепить'}
                        >
                          <Pin size={16} className={thread.is_pinned ? 'text-accent' : ''} />
                        </button>
                        <button
                          onClick={() => handleToggleLock(thread.id, thread.is_locked)}
                          className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text transition-colors"
                          title={thread.is_locked ? 'Разблокировать' : 'Заблокировать'}
                        >
                          <Lock size={16} className={thread.is_locked ? 'text-yellow-500' : ''} />
                        </button>
                        <button
                          onClick={() => navigate(`/forum/thread/${thread.id}`)}
                          className="p-1.5 rounded hover:bg-bg-elevated text-text-secondary hover:text-text transition-colors"
                          title="Просмотр"
                        >
                          <Edit size={16} />
                        </button>
                        <button
                          onClick={() => handleDeleteThread(thread.id)}
                          className="p-1.5 rounded hover:bg-bg-elevated text-red-400 hover:text-red-300 transition-colors"
                          title="Удалить"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-6 border-t border-border flex items-center justify-between">
            <Button
              variant="secondary"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
            >
              Назад
            </Button>
            <span className="text-sm text-text-secondary">
              Страница {page} из {totalPages}
            </span>
            <Button
              variant="secondary"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
            >
              Вперед
            </Button>
          </div>
        )}
      </Card>
    </div>
  )
}
