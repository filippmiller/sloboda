import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { toast } from 'sonner'
import { UserPlus, Loader2, AlertCircle } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import type { InviteInfo } from '@/types'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const registerSchema = z.object({
  name: z.string().min(2, 'Минимум 2 символа'),
  password: z.string()
    .min(8, 'Минимум 8 символов')
    .regex(/[A-Z]/, 'Нужна хотя бы одна заглавная буква')
    .regex(/[a-z]/, 'Нужна хотя бы одна строчная буква')
    .regex(/[0-9]/, 'Нужна хотя бы одна цифра'),
  confirmPassword: z.string().min(1, 'Подтвердите пароль'),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Пароли не совпадают',
  path: ['confirmPassword'],
})

type RegisterForm = z.infer<typeof registerSchema>

export default function Register() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null)
  const [verifying, setVerifying] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
        setError('Ссылка-приглашение не содержит токен')
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
          'Приглашение недействительно или истекло'
        setError(message)
      } finally {
        setVerifying(false)
      }
    }

    verifyInvite()
  }, [token, form])

  const handleSubmit = async (data: RegisterForm) => {
    if (!token) return

    setIsSubmitting(true)
    try {
      await api.post('/user/auth/accept-invite', {
        token,
        password: data.password,
        name: data.name,
      })
      toast.success('Регистрация завершена!')

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
        'Ошибка регистрации. Попробуйте позже.'
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
          Проверяем приглашение...
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
          Ошибка приглашения
        </h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          {error}
        </p>
        <Link
          to="/login"
          className="inline-block text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Перейти к входу
        </Link>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold font-display mb-1">
          Регистрация
        </h2>
        <p className="text-text-secondary text-sm">
          Завершите регистрацию, чтобы присоединиться к сообществу
        </p>
      </div>

      {inviteInfo && (
        <div className="bg-bg-elevated border border-border rounded-lg p-3">
          <p className="text-sm text-text-secondary">
            Приглашение для:{' '}
            <span className="text-text font-medium">{inviteInfo.email}</span>
          </p>
        </div>
      )}

      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4">
        <Input
          label="Имя"
          placeholder="Как вас зовут"
          {...form.register('name')}
          error={form.formState.errors.name?.message}
        />

        <Input
          label="Пароль"
          type="password"
          placeholder="Буквы верхнего/нижнего регистра + цифра"
          {...form.register('password')}
          error={form.formState.errors.password?.message}
        />

        <Input
          label="Подтвердите пароль"
          type="password"
          placeholder="Повторите пароль"
          {...form.register('confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
        />

        <Button type="submit" loading={isSubmitting} className="w-full">
          <UserPlus size={16} />
          Зарегистрироваться
        </Button>
      </form>

      <p className="text-center text-xs text-text-muted">
        Уже есть аккаунт?{' '}
        <Link
          to="/login"
          className="text-accent hover:text-accent-hover transition-colors"
        >
          Войти
        </Link>
      </p>
    </div>
  )
}
