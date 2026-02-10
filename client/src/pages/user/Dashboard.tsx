import { useState, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { format } from 'date-fns'
import { motion } from 'motion/react'
import {
  Newspaper,
  BookOpen,
  FileText,
  Upload,
  ArrowRight,
  Clock,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type { Post } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { SkeletonList } from '@/components/ui/Skeleton'
import { estimateReadingTime, formatReadingTime } from '@/utils/readingTime'
import { useDateLocale } from '@/hooks/useDateLocale'

interface DashboardStats {
  newsCount: number
  articlesCount: number
  mySubmissionsCount: number
}

function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0)
  const prevRef = useRef(0)

  useEffect(() => {
    const start = prevRef.current
    const diff = value - start
    if (diff === 0) return
    const duration = 600
    const startTime = performance.now()

    function step(now: number) {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      setDisplay(Math.round(start + diff * eased))
      if (progress < 1) requestAnimationFrame(step)
    }

    requestAnimationFrame(step)
    prevRef.current = value
  }, [value])

  return <>{display}</>
}

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  }),
}

export default function Dashboard() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()
  const user = useAuthStore((s) => s.user)
  const [stats, setStats] = useState<DashboardStats>({
    newsCount: 0,
    articlesCount: 0,
    mySubmissionsCount: 0,
  })
  const [recentNews, setRecentNews] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      try {
        const [newsRes, articlesRes, myRes, recentRes] = await Promise.allSettled([
          api.get('/user/news', { params: { limit: 1 } }),
          api.get('/user/articles', { params: { limit: 1 } }),
          api.get('/user/knowledge/my'),
          api.get('/user/news', { params: { limit: 3 } }),
        ])

        setStats({
          newsCount:
            newsRes.status === 'fulfilled' ? (newsRes.value.data.total ?? 0) : 0,
          articlesCount:
            articlesRes.status === 'fulfilled' ? (articlesRes.value.data.total ?? 0) : 0,
          mySubmissionsCount:
            myRes.status === 'fulfilled'
              ? (myRes.value.data.total ?? myRes.value.data.data?.length ?? 0)
              : 0,
        })

        if (recentRes.status === 'fulfilled') {
          setRecentNews(recentRes.value.data.data ?? [])
        }
      } catch {
        // Stats are non-critical, fail silently
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [])

  const statCards = [
    {
      label: t('dashboard.stats.news'),
      value: stats.newsCount,
      icon: Newspaper,
      to: '/news',
      color: 'text-accent',
      bg: 'bg-accent/10',
      glow: 'shadow-[0_0_12px_var(--color-accent-glow)]',
    },
    {
      label: t('dashboard.stats.articles'),
      value: stats.articlesCount,
      icon: BookOpen,
      to: '/library',
      color: 'text-green',
      bg: 'bg-green/10',
      glow: 'shadow-[0_0_12px_rgba(74,124,89,0.15)]',
    },
    {
      label: t('dashboard.stats.mySubmissions'),
      value: stats.mySubmissionsCount,
      icon: FileText,
      to: '/submit',
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
      glow: 'shadow-[0_0_12px_rgba(96,165,250,0.15)]',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        custom={0}
        variants={staggerItem}
        initial="hidden"
        animate="visible"
      >
        <h1 className="text-2xl font-bold font-display mb-2">
          {user?.name ? t('dashboard.greeting', { name: user.name }) : t('dashboard.greetingDefault')}
        </h1>
        <p className="text-text-secondary text-sm">
          {t('dashboard.subtitle')}
        </p>
      </motion.div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat, i) => (
          <motion.div
            key={stat.label}
            custom={i + 1}
            variants={staggerItem}
            initial="hidden"
            animate="visible"
          >
            <Link to={stat.to}>
              <Card variant="interactive">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg ${stat.bg} ${stat.glow} flex items-center justify-center`}>
                    <stat.icon className={stat.color} size={20} />
                  </div>
                  <div>
                    {loading ? (
                      <div className="h-7 w-8 bg-bg-elevated rounded animate-shimmer bg-gradient-to-r from-bg-elevated via-border/40 to-bg-elevated bg-[length:200%_100%]" />
                    ) : (
                      <p className="text-2xl font-bold font-display">
                        <AnimatedNumber value={stat.value} />
                      </p>
                    )}
                    <p className="text-xs text-text-secondary">{stat.label}</p>
                  </div>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
      </div>

      {/* Recent news */}
      <motion.div
        custom={4}
        variants={staggerItem}
        initial="hidden"
        animate="visible"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-display">{t('dashboard.recentNews.title')}</h2>
          <Link to="/news" className="text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
            {t('dashboard.recentNews.viewAll')}
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <SkeletonList items={3} />
        ) : recentNews.length > 0 ? (
          <div className="grid gap-4">
            {recentNews.map((post, i) => (
              <motion.div
                key={post.id}
                custom={5 + i}
                variants={staggerItem}
                initial="hidden"
                animate="visible"
              >
                <Link to={`/news/${post.slug}`}>
                  <Card variant="interactive">
                    <div className="flex justify-between items-start gap-4">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-medium text-text mb-1 truncate">
                          {post.title}
                        </h3>
                        {post.summary && (
                          <p className="text-sm text-text-secondary line-clamp-2">
                            {post.summary}
                          </p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-text-muted mt-1">
                          <time>
                            {format(new Date(post.published_at ?? post.created_at), 'd MMM yyyy', {
                              locale: dateLocale,
                            })}
                          </time>
                          {post.body && (
                            <span className="flex items-center gap-1">
                              <Clock size={12} />
                              {formatReadingTime(estimateReadingTime(post.body))}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-text-secondary text-sm text-center py-4">
              {t('dashboard.recentNews.empty')}
            </p>
          </Card>
        )}
      </motion.div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <motion.div custom={8} variants={staggerItem} initial="hidden" animate="visible">
          <Link to="/submit">
            <Card variant="interactive">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-accent/10 shadow-[0_0_12px_var(--color-accent-glow)] flex items-center justify-center">
                  <Upload className="text-accent" size={20} />
                </div>
                <div>
                  <p className="font-medium text-sm">{t('dashboard.quickLinks.submitKnowledge')}</p>
                  <p className="text-xs text-text-secondary">
                    {t('dashboard.quickLinks.submitKnowledgeDescription')}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </motion.div>

        <motion.div custom={9} variants={staggerItem} initial="hidden" animate="visible">
          <Link to="/library">
            <Card variant="interactive">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green/10 shadow-[0_0_12px_rgba(74,124,89,0.15)] flex items-center justify-center">
                  <BookOpen className="text-green" size={20} />
                </div>
                <div>
                  <p className="font-medium text-sm">{t('dashboard.quickLinks.library')}</p>
                  <p className="text-xs text-text-secondary">
                    {t('dashboard.quickLinks.libraryDescription')}
                  </p>
                </div>
              </div>
            </Card>
          </Link>
        </motion.div>
      </div>

      {/* Action button on mobile */}
      <div className="sm:hidden">
        <Link to="/submit">
          <Button className="w-full">
            <Upload size={16} />
            {t('dashboard.quickLinks.submitMaterial')}
          </Button>
        </Link>
      </div>
    </div>
  )
}
