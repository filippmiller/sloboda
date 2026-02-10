import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import { format } from 'date-fns'
import { useDateLocale } from '@/hooks/useDateLocale'
import { Save, Loader2, Mail, Calendar, Clock, Globe } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import { SUPPORTED_LANGUAGES } from '@/i18n'
import type { PortalUser, UserProfile } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { Textarea } from '@/components/ui/Input'
import AvatarUpload from '@/components/profile/AvatarUpload'
import CountrySelect from '@/components/profile/CountrySelect'
import TagInput from '@/components/profile/TagInput'

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
  const checkAuth = useAuthStore((s) => s.checkAuth)
  const [profile, setProfile] = useState<PortalUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savingLang, setSavingLang] = useState(false)
  const [savingExtended, setSavingExtended] = useState(false)

  // Extended profile state
  const [extended, setExtended] = useState<UserProfile>({
    countryCode: '',
    city: '',
    region: '',
    birthYear: undefined,
    gender: undefined,
    bio: '',
    profession: '',
    skills: [],
    interests: [],
    hobbies: [],
    motivation: '',
    participationInterest: undefined,
  })

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
        if (data.profile) {
          setExtended({
            countryCode: data.profile.countryCode ?? '',
            city: data.profile.city ?? '',
            region: data.profile.region ?? '',
            birthYear: data.profile.birthYear ?? undefined,
            gender: data.profile.gender ?? undefined,
            bio: data.profile.bio ?? '',
            profession: data.profile.profession ?? '',
            skills: data.profile.skills ?? [],
            interests: data.profile.interests ?? [],
            hobbies: data.profile.hobbies ?? [],
            motivation: data.profile.motivation ?? '',
            participationInterest: data.profile.participationInterest ?? undefined,
          })
        }
      } catch {
        toast.error(t('common.errors.unknownError'))
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [form, t])

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

    // Optimistic update
    const previousProfile = profile
    setProfile((prev) => prev ? { ...prev, ...data } : prev)

    try {
      const response = await api.patch('/user/profile', data)
      const updated = (response.data.data ?? response.data) as PortalUser
      setProfile(updated)
      await checkAuth() // Update auth store
      toast.success(t('profile.editProfile.savedToast'))
    } catch (err: unknown) {
      // Rollback on error
      setProfile(previousProfile)
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('common.errors.unknownError')
      toast.error(message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveExtended = async () => {
    setSavingExtended(true)

    // Optimistic update
    const previousProfile = profile
    setProfile((prev) => prev ? { ...prev, profile: extended } : prev)

    try {
      const payload: Record<string, unknown> = {}
      if (extended.countryCode) payload.countryCode = extended.countryCode
      if (extended.city) payload.city = extended.city
      if (extended.region) payload.region = extended.region
      if (extended.birthYear) payload.birthYear = extended.birthYear
      if (extended.gender) payload.gender = extended.gender
      if (extended.bio) payload.bio = extended.bio
      if (extended.profession) payload.profession = extended.profession
      if (extended.skills && extended.skills.length > 0) payload.skills = extended.skills
      if (extended.interests && extended.interests.length > 0) payload.interests = extended.interests
      if (extended.hobbies && extended.hobbies.length > 0) payload.hobbies = extended.hobbies
      if (extended.motivation) payload.motivation = extended.motivation
      if (extended.participationInterest) payload.participationInterest = extended.participationInterest

      const response = await api.put('/user/profile/extended', payload)
      const updated = (response.data.data ?? response.data) as PortalUser
      setProfile(updated)
      toast.success(t('profile.extendedProfile.savedToast'))
    } catch {
      // Rollback on error
      setProfile(previousProfile)
      toast.error(t('common.errors.unknownError'))
    } finally {
      setSavingExtended(false)
    }
  }

  const handleAvatarUpload = async (file: File) => {
    const formData = new FormData()
    formData.append('avatar', file)
    const response = await api.post('/user/profile/avatar', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })
    const avatarUrl = response.data.avatarUrl
    setProfile((prev) => prev ? { ...prev, avatarUrl } : prev)
    await checkAuth()
    toast.success(t('profile.avatar.savedToast', t('profile.editProfile.savedToast')))
  }

  const handleAvatarRemove = async () => {
    await api.delete('/user/profile/avatar')
    setProfile((prev) => prev ? { ...prev, avatarUrl: undefined } : prev)
    await checkAuth()
  }

  const genderOptions = [
    { value: 'male', label: t('onboarding.genderMale') },
    { value: 'female', label: t('onboarding.genderFemale') },
    { value: 'other', label: t('onboarding.genderOther') },
    { value: 'prefer_not_to_say', label: t('onboarding.genderPreferNot') },
  ]

  const participationOptions = [
    { value: 'relocate', label: t('onboarding.participationRelocate') },
    { value: 'invest', label: t('onboarding.participationInvest') },
    { value: 'remote', label: t('onboarding.participationRemote') },
    { value: 'visit', label: t('onboarding.participationVisit') },
    { value: 'other', label: t('onboarding.participationOther') },
  ]

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

      {/* Avatar */}
      <Card>
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('profile.avatar.heading')}
          </h2>
          <AvatarUpload
            currentUrl={profile?.avatarUrl}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
            size="lg"
          />
        </div>
      </Card>

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
                <p className="text-sm text-text">{profile?.email ?? t('profile.accountInfo.placeholder')}</p>
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
                    ? format(new Date(profile.created_at), 'd MMMM yyyy', { locale: dateLocale })
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
                    ? format(new Date(profile.last_login), 'd MMM yyyy, HH:mm', { locale: dateLocale })
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

      {/* Basic profile fields */}
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

      {/* Extended profile */}
      <Card>
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-wide">
            {t('profile.extendedProfile.heading')}
          </h2>

          <CountrySelect
            label={t('onboarding.countryLabel')}
            placeholder={t('onboarding.countryPlaceholder')}
            value={extended.countryCode ?? ''}
            onChange={(code) => setExtended((prev) => ({ ...prev, countryCode: code }))}
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('onboarding.cityLabel')}
              placeholder={t('onboarding.cityPlaceholder')}
              value={extended.city ?? ''}
              onChange={(e) => setExtended((prev) => ({ ...prev, city: e.target.value }))}
            />
            <Input
              label={t('onboarding.regionLabel')}
              placeholder={t('onboarding.regionPlaceholder')}
              value={extended.region ?? ''}
              onChange={(e) => setExtended((prev) => ({ ...prev, region: e.target.value }))}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label={t('onboarding.birthYearLabel')}
              placeholder={t('onboarding.birthYearPlaceholder')}
              type="number"
              min="1900"
              max={new Date().getFullYear()}
              value={extended.birthYear ?? ''}
              onChange={(e) => setExtended((prev) => ({ ...prev, birthYear: e.target.value ? parseInt(e.target.value) : undefined }))}
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-text-secondary">
                {t('onboarding.genderLabel')}
              </label>
              <select
                value={extended.gender ?? ''}
                onChange={(e) => setExtended((prev) => ({ ...prev, gender: e.target.value as UserProfile['gender'] }))}
                className="w-full px-3 py-2 rounded-lg bg-bg-card border border-border text-text text-sm focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-glow)] transition-all duration-200 appearance-none"
              >
                <option value="">{t('onboarding.genderPreferNot')}</option>
                {genderOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <Textarea
            label={t('onboarding.bioLabel')}
            placeholder={t('onboarding.bioPlaceholder')}
            value={extended.bio ?? ''}
            onChange={(e) => setExtended((prev) => ({ ...prev, bio: e.target.value }))}
            rows={3}
          />

          <Input
            label={t('onboarding.professionLabel')}
            placeholder={t('onboarding.professionPlaceholder')}
            value={extended.profession ?? ''}
            onChange={(e) => setExtended((prev) => ({ ...prev, profession: e.target.value }))}
          />

          <TagInput
            label={t('onboarding.skillsLabel')}
            placeholder={t('onboarding.skillsPlaceholder')}
            value={extended.skills ?? []}
            onChange={(tags) => setExtended((prev) => ({ ...prev, skills: tags }))}
          />

          <TagInput
            label={t('onboarding.interestsLabel')}
            placeholder={t('onboarding.interestsPlaceholder')}
            value={extended.interests ?? []}
            onChange={(tags) => setExtended((prev) => ({ ...prev, interests: tags }))}
          />

          <TagInput
            label={t('onboarding.hobbiesLabel')}
            placeholder={t('onboarding.hobbiesPlaceholder')}
            value={extended.hobbies ?? []}
            onChange={(tags) => setExtended((prev) => ({ ...prev, hobbies: tags }))}
          />

          <Textarea
            label={t('onboarding.motivationLabel')}
            placeholder={t('onboarding.motivationPlaceholder')}
            value={extended.motivation ?? ''}
            onChange={(e) => setExtended((prev) => ({ ...prev, motivation: e.target.value }))}
            rows={3}
          />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              {t('onboarding.participationLabel')}
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {participationOptions.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setExtended((prev) => ({ ...prev, participationInterest: opt.value as UserProfile['participationInterest'] }))}
                  className={`
                    px-4 py-2.5 rounded-lg text-sm text-left
                    border transition-all duration-200
                    ${extended.participationInterest === opt.value
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border bg-bg-card text-text-secondary hover:border-border-hover hover:text-text'
                    }
                  `}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <Button onClick={handleSaveExtended} loading={savingExtended}>
              <Save size={16} />
              {t('profile.editProfile.saveButton')}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  )
}
