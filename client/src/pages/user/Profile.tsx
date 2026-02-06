import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Save, Loader2, User as UserIcon, Mail, Calendar, Clock } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type { PortalUser } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const profileSchema = z.object({
  name: z.string().min(2, 'Минимум 2 символа'),
  telegram: z.string().optional(),
  location: z.string().optional(),
})

type ProfileForm = z.infer<typeof profileSchema>

export default function Profile() {
  const authUser = useAuthStore((s) => s.user)
  const [profile, setProfile] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const form = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: '',
      telegram: '',
      location: '',
    },
  })

  useEffect(() => {
    async function fetchProfile() {
      try {
        const response = await api.get('/user/profile')
        const data = (response.data.data ?? response.data) as PortalUser
        setProfile(data)
        form.reset({
          name: data.name ?? '',
          telegram: data.telegram ?? '',
          location: data.location ?? '',
        })
      } catch {
        toast.error('Не удалось загрузить профиль')
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [form])

  const handleSave = async (data: ProfileForm) => {
    setSaving(true)
    try {
      const response = await api.patch('/user/profile', data)
      const updated = (response.data.data ?? response.data) as PortalUser
      setProfile(updated)
      toast.success('Профиль обновлён')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Ошибка сохранения. Попробуйте позже.'
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display">Профиль</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-text-muted" size={24} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">Профиль</h1>

      {/* Read-only info */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Информация об аккаунте
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Mail className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">Email</p>
                <p className="text-sm text-text">{profile?.email ?? authUser?.email ?? '---'}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <UserIcon className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">Статус</p>
                <p className="text-sm text-text">
                  {profile?.status === 'active'
                    ? 'Активный участник'
                    : profile?.status === 'suspended'
                    ? 'Приостановлен'
                    : '---'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Calendar className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">Участник с</p>
                <p className="text-sm text-text">
                  {profile?.created_at
                    ? format(new Date(profile.created_at), 'd MMMM yyyy', {
                        locale: ru,
                      })
                    : '---'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Clock className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">Последний вход</p>
                <p className="text-sm text-text">
                  {profile?.last_login
                    ? format(
                        new Date(profile.last_login),
                        'd MMM yyyy, HH:mm',
                        { locale: ru },
                      )
                    : '---'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Editable fields */}
      <Card>
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            Редактировать профиль
          </h2>

          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <Input
              label="Имя"
              placeholder="Ваше имя"
              {...form.register('name')}
              error={form.formState.errors.name?.message}
            />

            <Input
              label="Telegram"
              placeholder="@username"
              {...form.register('telegram')}
              error={form.formState.errors.telegram?.message}
            />

            <Input
              label="Местоположение"
              placeholder="Город или регион"
              {...form.register('location')}
              error={form.formState.errors.location?.message}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save size={16} />
                Сохранить
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
