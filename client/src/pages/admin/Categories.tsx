import { useEffect, useState } from 'react'
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
  GripVertical,
} from 'lucide-react'
import type { Category } from '@/types'

interface CategoryForm {
  name: string
  slug: string
  description: string
  sortOrder: string
}

const emptyForm: CategoryForm = { name: '', slug: '', description: '', sortOrder: '0' }

export default function Categories() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)

  // Form modal
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [form, setForm] = useState<CategoryForm>(emptyForm)
  const [saving, setSaving] = useState(false)

  // Delete
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const fetchCategories = async () => {
    setLoading(true)
    try {
      const res = await adminApi.get('/admin/categories')
      setCategories(res.data.data ?? [])
    } catch {
      toast.error('Ошибка загрузки категорий')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCategories()
  }, [])

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9а-яё\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/[а-яё]/g, (char) => {
        const map: Record<string, string> = {
          'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e',
          'ё': 'yo', 'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k',
          'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r',
          'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
          'ч': 'ch', 'ш': 'sh', 'щ': 'shch', 'ъ': '', 'ы': 'y', 'ь': '',
          'э': 'e', 'ю': 'yu', 'я': 'ya',
        }
        return map[char] ?? char
      })
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
    setModalOpen(true)
  }

  const openEdit = (cat: Category) => {
    setEditing(cat)
    setForm({
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? '',
      sortOrder: cat.sort_order.toString(),
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.name.trim() || !form.slug.trim()) {
      toast.error('Введите название и slug')
      return
    }

    setSaving(true)
    try {
      const payload = {
        name: form.name,
        slug: form.slug,
        description: form.description || undefined,
        sortOrder: parseInt(form.sortOrder) || 0,
      }

      if (editing) {
        await adminApi.patch(`/admin/categories/${editing.id}`, payload)
        toast.success('Категория обновлена')
      } else {
        await adminApi.post('/admin/categories', payload)
        toast.success('Категория создана')
      }

      setModalOpen(false)
      fetchCategories()
    } catch (err) {
      const msg = (err as { response?: { data?: { error?: string } } }).response?.data?.error || 'Ошибка сохранения'
      toast.error(msg)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      await adminApi.delete(`/admin/categories/${deleteId}`)
      toast.success('Категория удалена')
      setDeleteId(null)
      fetchCategories()
    } catch {
      toast.error('Ошибка удаления')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold font-display">Категории</h1>
        <Button size="sm" onClick={openCreate}>
          <Plus size={16} />
          Добавить
        </Button>
      </div>

      <Card padding="none">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 size={24} className="animate-spin text-accent" />
          </div>
        ) : categories.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            Категорий пока нет
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="w-8 p-3"></th>
                  <th className="text-left p-3 text-text-secondary font-medium">Название</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Slug</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Описание</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Порядок</th>
                  <th className="text-left p-3 text-text-secondary font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {categories
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((cat) => (
                    <tr key={cat.id} className="border-b border-border/50 hover:bg-bg-elevated/50 transition-colors">
                      <td className="p-3 text-text-muted">
                        <GripVertical size={14} />
                      </td>
                      <td className="p-3 font-medium">{cat.name}</td>
                      <td className="p-3 text-text-muted font-mono text-xs">{cat.slug}</td>
                      <td className="p-3 text-text-secondary max-w-xs truncate">{cat.description || '--'}</td>
                      <td className="p-3 text-text-muted">{cat.sort_order}</td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <button
                            onClick={() => openEdit(cat)}
                            className="p-1.5 rounded text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
                          >
                            <Edit3 size={14} />
                          </button>
                          <button
                            onClick={() => setDeleteId(cat.id)}
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

      {/* Create/Edit Modal */}
      <Modal
        open={modalOpen}
        onOpenChange={setModalOpen}
        title={editing ? 'Редактировать категорию' : 'Новая категория'}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Название"
            value={form.name}
            onChange={(e) => {
              const name = e.target.value
              setForm({
                ...form,
                name,
                slug: editing ? form.slug : generateSlug(name),
              })
            }}
            placeholder="Название категории"
          />

          <Input
            label="Slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
            placeholder="category-slug"
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">Описание</label>
            <textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="Описание категории..."
              rows={2}
              className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border
                text-text text-sm placeholder:text-text-muted resize-none
                focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30"
            />
          </div>

          <Input
            label="Порядок сортировки"
            type="number"
            value={form.sortOrder}
            onChange={(e) => setForm({ ...form, sortOrder: e.target.value })}
          />

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" size="sm" onClick={() => setModalOpen(false)}>
              Отмена
            </Button>
            <Button size="sm" loading={saving} onClick={handleSave}>
              {editing ? 'Сохранить' : 'Создать'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <Modal
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
        title="Удалить категорию?"
        description="Это действие нельзя отменить. Публикации в этой категории потеряют привязку."
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
