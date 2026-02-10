import { useState, useEffect, useMemo } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type { InviteInfo } from '@/types'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function Register() {
  const { t } = useTranslation()
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const registerSchema = useMemo(() => z.object({
    name: z.string().min(2, t('auth.validation.nameMin2')),
    password: z.string()
      .min(8, t('auth.validation.passwordMin8'))
      .regex(/[A-Z]/, t('auth.validation.passwordUppercase'))
      .regex(/[a-z]/, t('auth.validation.passwordLowercase'))
      .regex(/[0-9]/, t('auth.validation.passwordDigit')),
    confirmPassword: z.string().min(1, t('auth.validation.confirmPasswordRequired')),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('auth.validation.passwordsMismatch'),
    path: ['confirmPassword'],
  }), [t])

  type RegisterForm = z.infer<typeof registerSchema>

  const form = useForm<RegisterForm>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      password: '',
      confirmPassword: '',
    },
  })

  useEffect(() => {
    async function verifyInvite() {
      if (!token) {
        setError(t('auth.register.inviteMissingToken'))
        setVerifying(false)
        return
      }

      try {
        const response = await api.get(`/user/auth/invite/${token}`)
        const invite = response.data as InviteInfo
        setInviteInfo(invite)
        if (invite.name) {
          form.setValue('name', invite.name)
        }
      } catch (err: unknown) {
        const message =
          (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
          t('auth.register.inviteInvalid')
        setError(message)
      } finally {
        setVerifying(false)
      }
    }

    verifyInvite()
  }, [token, form, t])

  const handleSubmit = async (data: RegisterForm) => {
    if (!token) return

    setIsSubmitting(true)
    try {
      await api.post('/user/auth/accept-invite', {
        token,
        password: data.password,
        name: data.name,
      })
      toast.success(t('auth.register.successToast'))

      // Auto-login with new credentials
      if (inviteInfo?.email) {
        try {
          await login(inviteInfo.email, data.password)
          navigate('/dashboard')
          return
        } catch {
          // If auto-login fails, redirect to login page
        }
      }

      navigate('/login')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        t('auth.register.error')
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (verifying) {
    return (
      <div className="flex flex-col items-center justify-center py-8 space-y-3">
        <Loader2 className="animate-spin text-text-secondary" size={32} />
        <p className="text-sm text-text-secondary">
          {t('auth.register.verifying')}
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center space-y-4 py-4">
        <div className="w-12 h-12 rounded-full bg-red-900/20 flex items-center justify-center mx-auto">
          <AlertCircle className="text-red-400" size={24} />
        </div>
        <h2 className="text-xl font-semibold font-display">
          {t('auth.register.inviteError')}
        </h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          {error}
        </p>
        <Link
          to="/login"
          className="inline-block text-sm text-accent hover:text-accent-hover transition-colors"
        >
          {t('common.actions.goToLogin')}
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold font-display mb-1">
          {t('auth.register.title')}
        </h2>
        <p className="text-text-secondary text-sm">
          {t('auth.register.subtitle')}
        </p>
      </div>

      {inviteInfo && (
        <div className="bg-bg-elevated border border-border rounded-lg p-3">
          <p className="text-sm text-text-secondary">
            {t('auth.register.inviteFor')}{' '}
            <span className="text-text font-medium">{inviteInfo.email}</span>
          </p>
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <Input
          label={t('auth.register.nameLabel')}
          placeholder={t('auth.register.namePlaceholder')}
          {...form.register('name')}
          error={form.formState.errors.name?.message}
        />

        <Input
          label={t('auth.register.passwordLabel')}
          type="password"
          placeholder={t('auth.register.passwordPlaceholder')}
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />

        <Input
          label={t('auth.register.confirmPasswordLabel')}
          type="password"
          placeholder={t('auth.register.confirmPasswordPlaceholder')}
          {...form.register('confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
        />

        <Button type="submit" loading={isSubmitting} className="w-full">
          <UserPlus size={16} />
          {t('auth.register.submitButton')}
        </Button>
      </form>

      <p className="text-center text-xs text-text-muted">
        {t('auth.register.hasAccount')}{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover transition-colors"
        >
          {t('auth.register.loginLink')}
        </Link>
      </p>
    </div>
  )
}
