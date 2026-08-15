import { useEffect, useState } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { toast } from 'sonner'
import { Loader2 } from 'lucide-react'

type Tab = 'wall' | 'polls' | 'news' | 'intents' | 'subscribers'

export default function Community() {
  const [tab, setTab] = useState<Tab>('wall')
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [data, setData] = useState<{
    wall: any[]
    polls: any[]
    news: any[]
    intents: any[]
    subscribers: any[]
  }>({ wall: [], polls: [], news: [], intents: [], subscribers: [] })

  const load = async () => {
    setLoading(true)
    try {
      const res = await adminApi.get('/admin/community')
      setData(res.data)
    } catch {
      toast.error('Не удалось загрузить сообщество')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [])

  const act = async (path: string) => {
    try {
      await adminApi.post(path)
      toast.success('Готово')
      load()
    } catch {
      toast.error('Не получилось')
    }
  }

  const generate = async () => {
    setGenerating(true)
    try {
      const res = await adminApi.post('/admin/community/news/generate')
      toast.success(`Черновиков: ${res.data.drafts?.length || 0}. Проверьте и опубликуйте.`)
      load()
    } catch {
      toast.error('Агент не собрал новости')
    } finally {
      setGenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-accent" />
      </div>
    )
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'wall', label: `Стена (${data.wall.length})` },
    { id: 'polls', label: `Опросы (${data.polls.length})` },
    { id: 'news', label: `Лента (${data.news.length})` },
    { id: 'intents', label: `Намерения (${data.intents.length})` },
    { id: 'subscribers', label: `Письма (${data.subscribers.length})` },
  ]

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-display font-bold">Сообщество</h1>
        <Button onClick={generate} disabled={generating}>
          {generating ? 'Собираю…' : 'Собрать черновики ленты'}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`px-3 py-1.5 rounded-lg text-sm ${tab === item.id ? 'bg-accent text-white' : 'bg-bg-elevated'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'wall' && data.wall.map((item) => (
        <Card key={item.id} className="p-4 space-y-2">
          <div className="text-sm text-text-secondary">{item.status} · {item.name} · {item.city || '—'}</div>
          <p>{item.body}</p>
          {item.status === 'pending' && (
            <div className="flex gap-2">
              <Button onClick={() => act(`/admin/community/wall/${item.id}/approve`)}>Пустить</Button>
              <Button variant="secondary" onClick={() => act(`/admin/community/wall/${item.id}/reject`)}>Скрыть</Button>
            </div>
          )}
        </Card>
      ))}

      {tab === 'polls' && data.polls.map((item) => (
        <Card key={item.id} className="p-4 space-y-2">
          <div className="text-sm text-text-secondary">{item.status} · {item.kind} · {item.author_name}</div>
          <h2 className="font-display text-lg">{item.title}</h2>
          <p>{item.body}</p>
          <p className="text-sm">{(item.options || []).join(' / ')}</p>
          {item.status === 'pending' && (
            <div className="flex gap-2">
              <Button onClick={() => act(`/admin/community/polls/${item.id}/approve`)}>Опубликовать</Button>
              <Button variant="secondary" onClick={() => act(`/admin/community/polls/${item.id}/reject`)}>Отклонить</Button>
            </div>
          )}
          {item.status === 'published' && (
            <Button variant="secondary" onClick={() => act(`/admin/community/polls/${item.id}/close`)}>Закрыть</Button>
          )}
        </Card>
      ))}

      {tab === 'news' && data.news.map((item) => (
        <Card key={item.id} className="p-4 space-y-2">
          <div className="text-sm text-text-secondary">{item.status} · {item.created_by} · {item.source_name}</div>
          <h2 className="font-display text-lg">{item.title}</h2>
          <p>{item.summary}</p>
          {item.source_url && <a className="text-accent text-sm" href={item.source_url} target="_blank" rel="noreferrer">{item.source_url}</a>}
          {item.status !== 'published' && (
            <div className="flex gap-2">
              <Button onClick={() => act(`/admin/community/news/${item.id}/publish`)}>Опубликовать</Button>
              <Button variant="secondary" onClick={() => act(`/admin/community/news/${item.id}/reject`)}>Скрыть</Button>
            </div>
          )}
        </Card>
      ))}

      {tab === 'intents' && data.intents.map((item) => (
        <Card key={item.id} className="p-4">
          <div>{item.email} · {item.amount} ₽ · {item.kind}</div>
          <div className="text-sm text-text-secondary">{item.name || 'без имени'} · это не платёж</div>
        </Card>
      ))}

      {tab === 'subscribers' && data.subscribers.map((item) => (
        <Card key={item.id} className="p-4">
          <div>{item.email}</div>
          <div className="text-sm text-text-secondary">
            {item.confirmed_at ? 'подтверждена' : 'ждёт письмо'} {item.unsubscribed_at ? '· отписался' : ''}
          </div>
        </Card>
      ))}
    </div>
  )
}
