import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import {
  Newspaper,
  BookOpen,
  FileText,
  Upload,
  ArrowRight,
  Loader2,
  Clock,
} from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type { Post } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { estimateReadingTime, formatReadingTime } from '@/utils/readingTime'

interface DashboardStats {
  newsCount: number
  articlesCount: number
  mySubmissionsCount: number
}

export default function Dashboard() {
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
      label: 'Новости',
      value: stats.newsCount,
      icon: Newspaper,
      to: '/news',
      color: 'text-accent',
      bg: 'bg-accent/10',
    },
    {
      label: 'Статьи',
      value: stats.articlesCount,
      icon: BookOpen,
      to: '/library',
      color: 'text-green',
      bg: 'bg-green/10',
    },
    {
      label: 'Мои заявки',
      value: stats.mySubmissionsCount,
      icon: FileText,
      to: '/submit',
      color: 'text-blue-400',
      bg: 'bg-blue-400/10',
    },
  ]

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-display mb-2">
          {user?.name ? `Привет, ${user.name}!` : 'Добро пожаловать!'}
        </h1>
        <p className="text-text-secondary text-sm">
          Обзор активности сообщества SLOBODA
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {statCards.map((stat) => (
          <Link key={stat.label} to={stat.to}>
            <Card className="hover:border-border-hover transition-colors cursor-pointer">
              <div className="flex items-center gap-4">
                <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={stat.color} size={20} />
                </div>
                <div>
                  {loading ? (
                    <Loader2 className="animate-spin text-text-muted" size={16} />
                  ) : (
                    <p className="text-2xl font-bold font-display">{stat.value}</p>
                  )}
                  <p className="text-xs text-text-secondary">{stat.label}</p>
                </div>
              </div>
            </Card>
          </Link>
        ))}
      </div>

      {/* Recent news */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold font-display">Последние новости</h2>
          <Link to="/news" className="text-sm text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
            Все новости
            <ArrowRight size={14} />
          </Link>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="animate-spin text-text-muted" size={24} />
          </div>
        ) : recentNews.length > 0 ? (
          <div className="grid gap-4">
            {recentNews.map((post) => (
              <Link key={post.id} to={`/news/${post.slug}`}>
                <Card className="hover:border-border-hover transition-colors cursor-pointer">
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
                            locale: ru,
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
            ))}
          </div>
        ) : (
          <Card>
            <p className="text-text-secondary text-sm text-center py-4">
              Пока нет новостей
            </p>
          </Card>
        )}
      </div>

      {/* Quick links */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Link to="/submit">
          <Card className="hover:border-border-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
                <Upload className="text-accent" size={20} />
              </div>
              <div>
                <p className="font-medium text-sm">Подать знания</p>
                <p className="text-xs text-text-secondary">
                  Предложите материал для библиотеки
                </p>
              </div>
            </div>
          </Card>
        </Link>

        <Link to="/library">
          <Card className="hover:border-border-hover transition-colors cursor-pointer">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center">
                <BookOpen className="text-green" size={20} />
              </div>
              <div>
                <p className="font-medium text-sm">Библиотека</p>
                <p className="text-xs text-text-secondary">
                  Материалы и знания сообщества
                </p>
              </div>
            </div>
          </Card>
        </Link>
      </div>

      {/* Action button on mobile */}
      <div className="sm:hidden">
        <Link to="/submit">
          <Button className="w-full">
            <Upload size={16} />
            Предложить материал
          </Button>
        </Link>
      </div>
    </div>
  )
}
