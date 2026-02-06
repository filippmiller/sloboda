import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Eye, Newspaper } from 'lucide-react'
import api from '@/services/api'
import type { Post } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

const PAGE_SIZE = 10

export default function News() {
  const [posts, setPosts] = useState<Post[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const fetchNews = useCallback(async (currentOffset: number, append: boolean) => {
    const setter = append ? setLoadingMore : setLoading
    setter(true)
    try {
      const response = await api.get('/user/news', {
        params: { limit: PAGE_SIZE, offset: currentOffset },
      })
      const data = response.data
      if (append) {
        setPosts((prev) => [...prev, ...(data.data ?? [])])
      } else {
        setPosts(data.data ?? [])
      }
      setTotal(data.total ?? 0)
    } catch {
      // Non-critical, fail silently
    } finally {
      setter(false)
    }
  }, [])

  useEffect(() => {
    fetchNews(0, false)
  }, [fetchNews])

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchNews(nextOffset, true)
  }

  const hasMore = posts.length < total

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display">Новости</h1>
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <div className="animate-pulse space-y-3">
                <div className="h-5 bg-bg-elevated rounded w-3/4" />
                <div className="h-4 bg-bg-elevated rounded w-full" />
                <div className="h-4 bg-bg-elevated rounded w-1/2" />
              </div>
            </Card>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">Новости</h1>

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post) => (
            <Link key={post.id} to={`/news/${post.slug}`}>
              <Card className="hover:border-border-hover transition-colors cursor-pointer mb-4">
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-4">
                    <h2 className="font-medium text-text leading-snug">
                      {post.title}
                    </h2>
                    <time className="text-xs text-text-muted whitespace-nowrap flex-shrink-0 mt-0.5">
                      {format(
                        new Date(post.published_at ?? post.created_at),
                        'd MMM yyyy',
                        { locale: ru },
                      )}
                    </time>
                  </div>

                  {post.summary && (
                    <p className="text-sm text-text-secondary line-clamp-2">
                      {post.summary}
                    </p>
                  )}

                  <div className="flex items-center gap-4 text-xs text-text-muted pt-1">
                    {post.category_name && (
                      <span className="px-2 py-0.5 rounded bg-bg-elevated text-text-secondary">
                        {post.category_name}
                      </span>
                    )}
                    {post.views != null && (
                      <span className="flex items-center gap-1">
                        <Eye size={12} />
                        {post.views}
                      </span>
                    )}
                  </div>
                </div>
              </Card>
            </Link>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                Загрузить ещё
              </Button>
            </div>
          )}
        </div>
      ) : (
        <Card>
          <div className="text-center py-12 space-y-3">
            <Newspaper className="text-text-muted mx-auto" size={40} />
            <p className="text-text-secondary text-sm">
              Пока нет опубликованных новостей
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
