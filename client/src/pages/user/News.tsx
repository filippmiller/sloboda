import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { useDateLocale } from '@/hooks/useDateLocale'
import { motion } from 'motion/react'
import { Eye, Newspaper, Pin, Clock } from 'lucide-react'
import api from '@/services/api'
import type { Post } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { SkeletonList } from '@/components/ui/Skeleton'
import { estimateReadingTime, formatReadingTime } from '@/utils/readingTime'
import EmptyState from '@/components/EmptyState'

const PAGE_SIZE = 10

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.05, duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  }),
}

export default function News() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
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
        <h1 className="text-2xl font-bold font-display">{t('news.title')}</h1>
        <SkeletonList items={5} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <motion.h1
        className="text-2xl font-bold font-display"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        {t('news.title')}
      </motion.h1>

      {posts.length > 0 ? (
        <div className="space-y-4">
          {posts.map((post, i) => (
            <motion.div
              key={post.id}
              custom={i}
              variants={staggerItem}
              initial="hidden"
              animate="visible"
            >
              <Link to={`/news/${post.slug}`}>
                <Card variant="interactive" className="mb-0">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-4">
                      <h2 className="font-medium text-text leading-snug">
                        {post.is_pinned && (
                          <Pin size={12} className="inline mr-1.5 text-amber-400 drop-shadow-[0_0_4px_rgba(251,191,36,0.3)]" />
                        )}
                        {post.title}
                      </h2>
                      <time className="text-xs text-text-muted whitespace-nowrap flex-shrink-0 mt-0.5">
                        {format(
                          new Date(post.published_at ?? post.created_at),
                          'd MMM yyyy',
                          { locale: dateLocale },
                        )}
                      </time>
                    </div>

                    {post.summary && (
                      <p className="text-sm text-text-secondary line-clamp-2">
                        {post.summary}
                      </p>
                    )}

                    <div className="flex items-center gap-3 text-xs text-text-muted pt-1">
                      {post.category_name && (
                        <Badge>{post.category_name}</Badge>
                      )}
                      {post.body && (
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatReadingTime(estimateReadingTime(post.body))}
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
            </motion.div>
          ))}

          {hasMore && (
            <div className="text-center pt-2">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                {t('common.actions.loadMore')}
              </Button>
            </div>
          )}
        </div>
      ) : (
        <EmptyState
          icon={Newspaper}
          title={t('news.empty')}
          description="No news articles have been published yet. Check back soon for community updates and announcements."
        />
      )}
    </div>
  )
}
