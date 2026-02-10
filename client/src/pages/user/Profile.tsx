import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useDateLocale } from '@/hooks/useDateLocale'
import { Save, Loader2, User as UserIcon, Mail, Calendar, Clock, Globe } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import type { PortalUser } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

type ProfileForm = {
  name: string
  telegram?: string
  location?: string
}

export default function Profile() {
  const { t } = useTranslation()
  const dateLocale = useDateLocale()

  const profileSchema = z.object({
    name: z.string().min(2, t('profile.validation.nameMin2')),
    telegram: z.string().optional(),
    location: z.string().optional(),
  })

  const { i18n } = useTranslation()
  const authUser = useAuthStore((s) => s.user)
  const [profile, setProfile] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingLang, setSavingLang] = useState(false)

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
        toast.error(t('common.errors.unknownError'))
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [form])

  const handleLanguageChange = async (newLang: string) => {
    setSavingLang(true)
    try {
      await i18n.changeLanguage(newLang)
      await api.patch('/user/profile', { preferredLanguage: newLang })
      toast.success(t('profile.language.savedToast'))
    } catch {
      toast.error(t('common.errors.unknownError'))
    } finally {
      setSavingLang(false)
    }
  }

  const handleSave = async (data: ProfileForm) => {
    setSaving(true)
    try {
      const response = await api.patch('/user/profile', data)
      const updated = (response.data.data ?? response.data) as PortalUser
      setProfile(updated)
      toast.success(t('profile.editProfile.savedToast'))
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('common.errors.unknownError')
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold font-display">{t('profile.title')}</h1>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="animate-spin text-text-muted" size={24} />
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold font-display">{t('profile.title')}</h1>

      {/* Read-only info */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('profile.accountInfo.heading')}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Mail className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('profile.accountInfo.email')}</p>
                <p className="text-sm text-text">{profile?.email ?? authUser?.email ?? t('profile.accountInfo.placeholder')}</p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <UserIcon className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('profile.accountInfo.status')}</p>
                <p className="text-sm text-text">
                  {profile?.status === 'active'
                    ? t('profile.accountInfo.statusActive')
                    : profile?.status === 'suspended'
                    ? t('profile.accountInfo.statusSuspended')
                    : t('profile.accountInfo.placeholder')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Calendar className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('profile.accountInfo.memberSince')}</p>
                <p className="text-sm text-text">
                  {profile?.created_at
                    ? format(new Date(profile.created_at), 'd MMMM yyyy', {
                        locale: dateLocale,
                      })
                    : t('profile.accountInfo.placeholder')}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
                <Clock className="text-text-muted" size={16} />
              </div>
              <div>
                <p className="text-xs text-text-muted">{t('profile.accountInfo.lastLogin')}</p>
                <p className="text-sm text-text">
                  {profile?.last_login
                    ? format(
                        new Date(profile.last_login),
                        'd MMM yyyy, HH:mm',
                        { locale: dateLocale },
                      )
                    : t('profile.accountInfo.placeholder')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Language preference */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('profile.language.heading')}
          </h2>

          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-bg-elevated flex items-center justify-center">
              <Globe className="text-text-muted" size={16} />
            </div>
            <div className="flex-1">
              <p className="text-xs text-text-muted mb-1">{t('profile.language.label')}</p>
              <div className="relative">
                <select
                  value={i18n.language}
                  onChange={(e) => handleLanguageChange(e.target.value)}
                  disabled={savingLang}
                  className="w-full sm:w-auto bg-bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-text appearance-none cursor-pointer pr-8 focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {SUPPORTED_LANGUAGES.map((lang) => (
                    <option key={lang.code} value={lang.code}>
                      {lang.flag} {lang.label}
                    </option>
                  ))}
                </select>
                {savingLang && (
                  <Loader2 className="absolute right-2 top-1/2 -translate-y-1/2 animate-spin text-text-muted" size={14} />
                )}
              </div>
            </div>
          </div>

          <p className="text-xs text-text-muted">
            {t('profile.language.description')}
          </p>
        </div>
      </Card>

      {/* Editable fields */}
      <Card>
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('profile.editProfile.heading')}
          </h2>

          <form onSubmit={form.handleSubmit(handleSave)} className="space-y-4">
            <Input
              label={t('profile.editProfile.nameLabel')}
              placeholder={t('profile.editProfile.namePlaceholder')}
              {...form.register('name')}
              error={form.formState.errors.name?.message}
            />

            <Input
              label={t('profile.editProfile.telegramLabel')}
              placeholder={t('profile.editProfile.telegramPlaceholder')}
              {...form.register('telegram')}
              error={form.formState.errors.telegram?.message}
            />

            <Input
              label={t('profile.editProfile.locationLabel')}
              placeholder={t('profile.editProfile.locationPlaceholder')}
              {...form.register('location')}
              error={form.formState.errors.location?.message}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                <Save size={16} />
                {t('profile.editProfile.saveButton')}
              </Button>
            </div>
          </form>
        </div>
      </Card>
    </div>
  )
}
