import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { BookmarkCheck, BookOpen, Clock, Loader2 } from 'lucide-react'
import api from '@/services/api'
import type { BookmarkedPost } from '@/types'
import Card from '@/components/ui/Card'
import { estimateReadingTime, formatReadingTime } from '@/utils/readingTime'

export default function Bookmarks() {
  const [bookmarks, setBookmarks] = useState<BookmarkedPost[]>([])
  const [loading, setLoading] = useState(true)

  const fetchBookmarks = async () => {
    setLoading(true)
    try {
      const res = await api.get('/user/bookmarks')
      setBookmarks(res.data.data ?? [])
    } catch {
      // Non-critical
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchBookmarks()
  }, [])

  const handleUnbookmark = async (postId: number) => {
    try {
      await api.post('/user/bookmarks/toggle', { postId })
      setBookmarks((prev) => prev.filter((b) => b.id !== postId))
    } catch {
      // Non-critical
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">Закладки</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-text-muted" size={24} />
        </div>
      ) : bookmarks.length > 0 ? (
        <div className="space-y-4">
          {bookmarks.map((post) => (
            <Card
              key={post.id}
              className="hover:border-border-hover transition-colors"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {post.category_name && (
                        <span className="px-2 py-0.5 rounded bg-bg-elevated text-text-secondary text-xs">
                          {post.category_name}
                        </span>
                      )}
                    </div>
                    <h3 className="font-medium text-text leading-snug">
                      {post.title}
                    </h3>
                    {post.summary && (
                      <p className="text-sm text-text-secondary line-clamp-2 mt-1">
                        {post.summary}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => handleUnbookmark(post.id)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-accent hover:bg-accent/10 transition-colors"
                    title="Убрать из закладок"
                  >
                    <BookmarkCheck size={18} />
                  </button>
                </div>

                <div className="flex items-center gap-3 text-xs text-text-muted pt-1">
                  <time>
                    {format(
                      new Date(post.published_at ?? post.created_at),
                      'd MMM yyyy',
                      { locale: ru },
                    )}
                  </time>
                  <span className="flex items-center gap-1">
                    <Clock size={12} />
                    {formatReadingTime(estimateReadingTime(post.body))}
                  </span>
                  <span className="text-text-muted">
                    Сохранено{' '}
                    {format(new Date(post.bookmarked_at), 'd MMM yyyy', {
                      locale: ru,
                    })}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12 space-y-3">
            <BookOpen className="text-text-muted mx-auto" size={40} />
            <p className="text-text-secondary text-sm">
              Нет закладок. Добавляйте статьи в закладки, нажимая на иконку закладки.
            </p>
            <Link
              to="/library"
              className="inline-block text-sm text-accent hover:text-accent-hover transition-colors"
            >
              Перейти в библиотеку
            </Link>
          </div>
        </Card>
      )}
    </div>
  )
}
