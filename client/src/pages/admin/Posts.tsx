import { useEffect, useState, useCallback } from 'react'
import adminApi from '@/services/adminApi'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import Modal from '@/components/ui/Modal'
import { toast } from 'sonner'
import {
  Plus,
  Loader2,
  Edit3,
  Trash2,
  Eye,
  Pin,
  PinOff,
  Bold,
  Italic,
  Heading2,
  List,
  Link2,
} from 'lucide-react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import LinkExtension from '@tiptap/extension-link'
import type { Post, Category } from '@/types'

type TabFilter = 'all' | 'news' | 'article' | 'draft'

const TABS: { value: TabFilter; label: string }[] = [
  { value: 'all', label: 'Все' },
  { value: 'news', label: 'Новости' },
  { value: 'article', label: 'Статьи' },
  { value: 'draft', label: 'Черновики' },
]

function TiptapToolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null

  return (
    <div className="flex items-center gap-1 p-2 border-b border-border">
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={`p-1.5 rounded transition-colors ${editor.isActive('bold') ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}`}
      >
        <Bold size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={`p-1.5 rounded transition-colors ${editor.isActive('italic') ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}`}
      >
        <Italic size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={`p-1.5 rounded transition-colors ${editor.isActive('heading', { level: 2 }) ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}`}
      >
        <Heading2 size={16} />
      </button>
      <button
        type="button"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={`p-1.5 rounded transition-colors ${editor.isActive('bulletList') ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}`}
      >
        <List size={16} />
      </button>
      <button
        type="button"
        onClick={() => {
          const url = prompt('URL ссылки:')
          if (url) {
            editor.chain().focus().setLink({ href: url }).run()
          }
        }}
        className={`p-1.5 rounded transition-colors ${editor.isActive('link') ? 'bg-accent/20 text-accent' : 'text-text-secondary hover:text-text hover:bg-bg-elevated'}`}
      >
        <Link2 size={16} />
      </button>
    </div>
  )
}

interface PostForm {
  title: string
  summary: string
  body: string
  type: 'news' | 'article'
  status: 'draft' | 'published'
  categoryId: string
}

export default function Posts() {
  const [posts, setPosts] = useState<Post[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabFilter>('all')

  // Editor modal
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingPost, setEditingPost] = useState<Post | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState<PostForm>({
    title: '',
    summary: '',
    body: '',
    type: 'news',
    status: 'draft',
    categoryId: '',
  })

  // Delete confirmation
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const editor = useEditor({
    extensions: [
      StarterKit,
      LinkExtension.configure({ openOnClick: false }),
    ],
    content: '',
    editorProps: {
      attributes: {
        class: 'prose prose-invert prose-sm max-w-none p-4 min-h-[200px] focus:outline-none text-text',
      },
    },
  })

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    try {
      const params: Record<string, string> = {}
      if (activeTab === 'news') params.type = 'news'
      else if (activeTab === 'article') params.type = 'article'
      else if (activeTab === 'draft') params.status = 'draft'

      const res = await adminApi.get('/admin/posts', { params })
      setPosts(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки публикаций')
    } finally {
      setLoading(false)
    }
  }, [activeTab])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  useEffect(() => {
    adminApi.get('/admin/categories')
      .then((res) => setCategories(res.data.data ?? []))
      .catch(() => {})
  }, [])

  const openCreate = () => {
    setEditingPost(null)
    setForm({ title: '', summary: '', body: '', type: 'news', status: 'draft', categoryId: '' })
    editor?.commands.setContent('')
    setEditorOpen(true)
  }

  const openEdit = (post: Post) => {
    setEditingPost(post)
    setForm({
      title: post.title,
      summary: post.summary ?? '',
      body: post.body,
      type: post.type === 'newsletter' || post.type === 'knowledge' ? 'news' : post.type,
      status: post.status === 'archived' ? 'draft' : post.status,
      categoryId: post.category_id?.toString() ?? '',
    })
    editor?.commands.setContent(post.body ?? '')
    setEditorOpen(true)
  }

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error('Введите заголовок')
      return
    }

    const bodyContent = editor?.getHTML() ?? ''
    if (!bodyContent || bodyContent === '<p></p>') {
      toast.error('Введите содержание')
      return
    }

    setSaving(true)
    try {
      const payload = {
        title: form.title,
        summary: form.summary || undefined,
        body: bodyContent,
        type: form.type,
        status: form.status,
        categoryId: form.categoryId ? parseInt(form.categoryId) : undefined,
      }

      if (editingPost) {
        await adminApi.patch(`/admin/posts/${editingPost.id}`, payload)
        toast.success('Публикация обновлена')
      } else {
        await adminApi.post('/admin/posts', payload)
        toast.success('Публикация создана')
      }

      setEditorOpen(false)
      fetchPosts()
    } catch {
      toast.error('Ошибка сохранения')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePin = async (post: Post) => {
    try {
      await adminApi.patch(`/admin/posts/${post.id}`, { isPinned: !post.is_pinned })
      toast.success(post.is_pinned ? 'Откреплено' : 'Закреплено')
      fetchPosts()
    } catch {
      toast.error('Ошибка')
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await adminApi.delete(`/admin/posts/${deleteId}`)
      toast.success('Публикация удалена')
      setDeleteId(null)
      fetchPosts()
    } catch {
      toast.error('Ошибка удаления')
    } finally {
      setDeleting(false)
    }
  }

  const typeLabels: Record<string, string> = {
    news: 'Новость',
    article: 'Статья',
    newsletter: 'Рассылка',
    knowledge: 'Знание',
  }

  const statusLabels: Record<string, string> = {
    draft: 'Черновик',
    published: 'Опубликовано',
    archived: 'В архиве',
  }

  const statusColors: Record<string, string> = {
    draft: 'bg-yellow-500/20 text-yellow-400',
    published: 'bg-green-500/20 text-green-400',
    archived: 'bg-gray-500/20 text-gray-400',
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Публикации</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} />
          Создать
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 p-1 bg-bg-card border border-border rounded-lg w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveTab(tab.value)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors
              ${activeTab === tab.value
                ? 'bg-accent/20 text-accent'
                : 'text-text-secondary hover:text-text'
              }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : posts.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Публикаций не найдено
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left p-3 text-text-secondary font-medium">Заголовок</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Тип</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Статус</th>
                  <th className="text-left p-3 text-text-secondary font-medium">
                    <Eye size={14} className="inline" />
                  </th>
                  <th className="text-left p-3 text-text-secondary font-medium">Дата</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {posts.map((post) => (
                  <tr key={post.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                    <td className="p-3 font-medium max-w-xs truncate">
                      {post.is_pinned && <Pin size={12} className="inline mr-1 text-accent" />}
                      {post.title}
                    </td>
                    <td className="p-3 text-text-secondary">{typeLabels[post.type] ?? post.type}</td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[post.status] ?? ''}`}>
                        {statusLabels[post.status] ?? post.status}
                      </span>
                    </td>
                    <td className="p-3 text-text-muted">{post.views ?? 0}</td>
                    <td className="p-3 text-text-muted">
                      {new Date(post.created_at).toLocaleDateString('ru-RU')}
                    </td>
                    <td className="p-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleTogglePin(post)}
                          title={post.is_pinned ? 'Открепить' : 'Закрепить'}
                          className={`p-1.5 rounded transition-colors ${
                            post.is_pinned
                              ? 'text-accent hover:text-text hover:bg-bg-elevated'
                              : 'text-text-secondary hover:text-accent hover:bg-accent/10'
                          }`}
                        >
                          {post.is_pinned ? <PinOff size={14} /> : <Pin size={14} />}
                        </button>
                        <button
                          onClick={() => openEdit(post)}
                          className="p-1.5 rounded text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(post.id)}
                          className="p-1.5 rounded text-text-secondary hover:text-red-400 hover:bg-red-900/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Post Editor Modal */}
      <Modal
        open={editorOpen}
        onOpenChange={setEditorOpen}
        title={editingPost ? 'Редактировать публикацию' : 'Новая публикация'}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Заголовок"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Заголовок публикации"
          />

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Тип</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value as PostForm['type'] })}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border
                  text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="news">Новость</option>
                <option value="article">Статья</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">Категория</label>
              <select
                value={form.categoryId}
                onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
                className="px-3 py-2 rounded-lg bg-bg-card border border-border
                  text-text text-sm focus:outline-none focus:border-accent"
              >
                <option value="">Без категории</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Краткое описание</label>
            <textarea
              value={form.summary}
              onChange={(e) => setForm({ ...form, summary: e.target.value })}
              placeholder="Краткое описание..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm placeholder:text-text-muted resize-none
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          {/* Tiptap Editor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Содержание</label>
            <div className="bg-bg-card border border-border rounded-lg overflow-hidden">
              <TiptapToolbar editor={editor} />
              <EditorContent editor={editor} />
            </div>
          </div>

          {/* Status toggle */}
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.status === 'published'}
              onChange={(e) => setForm({ ...form, status: e.target.checked ? 'published' : 'draft' })}
              className="w-4 h-4 rounded border-border bg-bg-card text-accent focus:ring-accent/30"
            />
            <span className="text-sm text-text-secondary">Опубликовать сразу</span>
          </label>

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setEditorOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editingPost ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Удалить публикацию?"
        description="Это действие нельзя отменить."
      >
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" size="sm" onClick={() => setDeleteId(null)}>
            Отмена
          </Button>
          <Button variant="danger" size="sm" loading={deleting} onClick={handleDelete}>
            Удалить
          </Button>
        </div>
      </Modal>
    </div>
  )
}
