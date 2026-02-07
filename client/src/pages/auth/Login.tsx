import { useState, useEffect } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'motion/react'
import { Mail, Lock, Wand2, Check, KeyRound } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

const loginSchema = z.object({
  email: z.string().email('Введите корректный email'),
  password: z.string().min(1, 'Введите пароль'),
  remember: z.boolean().optional(),
})

const magicLinkSchema = z.object({
  email: z.string().email('Введите корректный email'),
})

const forgotPasswordSchema = z.object({
  email: z.string().email('Введите корректный email'),
})

const resetPasswordSchema = z.object({
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

type LoginForm = z.infer<typeof loginSchema>
type MagicLinkForm = z.infer<typeof magicLinkSchema>
type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>
type ResetPasswordForm = z.infer<typeof resetPasswordSchema>

const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.08, duration: 0.35, ease: [0.4, 0, 0.2, 1] as const },
  }),
}

export default function Login() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const login = useAuthStore((s) => s.login)
  const [useMagicLink, setUseMagicLink] = useState(false)
  const [magicLinkSent, setMagicLinkSent] = useState(false)
  const [showForgotPassword, setShowForgotPassword] = useState(false)
  const [forgotPasswordSent, setForgotPasswordSent] = useState(false)
  const [resetToken, setResetToken] = useState<string | null>(null)
  const [resetSuccess, setResetSuccess] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    const token = searchParams.get('reset')
    if (token) {
      setResetToken(token)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  const loginForm = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
      remember: false,
    },
  })

  const magicForm = useForm<MagicLinkForm>({
    resolver: zodResolver(magicLinkSchema),
    defaultValues: {
      email: '',
    },
  })

  const forgotForm = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  })

  const resetForm = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { password: '', confirmPassword: '' },
  })

  const handleLogin = async (data: LoginForm) => {
    setIsLoading(true)
    try {
      await login(data.email, data.password)
      toast.success('Добро пожаловать!')
      navigate('/dashboard')
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message :
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Ошибка входа. Проверьте email и пароль.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleMagicLink = async (data: MagicLinkForm) => {
    setIsLoading(true)
    try {
      await api.post('/user/auth/magic-link', { email: data.email })
      setMagicLinkSent(true)
      toast.success('Ссылка для входа отправлена')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'Не удалось отправить ссылку. Попробуйте позже.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (data: ForgotPasswordForm) => {
    setIsLoading(true)
    try {
      await api.post('/user/auth/forgot-password', { email: data.email })
      setForgotPasswordSent(true)
    } catch {
      // Always show success to prevent email enumeration
      setForgotPasswordSent(true)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (data: ResetPasswordForm) => {
    setIsLoading(true)
    try {
      await api.post('/user/auth/reset-password', {
        token: resetToken,
        password: data.password,
      })
      setResetSuccess(true)
      setResetToken(null)
      toast.success('Пароль успешно изменён')
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        'Не удалось сбросить пароль. Попробуйте запросить новую ссылку.'
      toast.error(message)
    } finally {
      setIsLoading(false)
    }
  }

  // Password reset form (when user clicks reset link in email)
  if (resetToken) {
    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <div>
          <h2 className="text-xl font-semibold font-display mb-1">
            Новый пароль
          </h2>
          <p className="text-text-secondary text-sm">
            Введите новый пароль для вашего аккаунта
          </p>
        </div>

        <form onSubmit={resetForm.handleSubmit(handleResetPassword)} className="space-y-4">
          <Input
            label="Новый пароль"
            type="password"
            placeholder="Буквы верхнего/нижнего регистра + цифра"
            icon={<Lock size={16} />}
            {...resetForm.register('password')}
            error={resetForm.formState.errors.password?.message}
          />
          <Input
            label="Подтвердите пароль"
            type="password"
            placeholder="Повторите пароль"
            icon={<Lock size={16} />}
            {...resetForm.register('confirmPassword')}
            error={resetForm.formState.errors.confirmPassword?.message}
          />
          <Button type="submit" loading={isLoading} className="w-full">
            <KeyRound size={16} />
            Установить пароль
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setResetToken(null)}
            className="text-sm text-text-secondary hover:text-text transition-colors"
          >
            Вернуться к входу
          </button>
        </div>
      </motion.div>
    )
  }

  // Success after password reset
  if (resetSuccess) {
    return (
      <motion.div
        className="text-center space-y-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
        >
          <Check className="text-green" size={24} />
        </motion.div>
        <h2 className="text-xl font-semibold font-display">
          Пароль изменён
        </h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          Теперь вы можете войти с новым паролем.
        </p>
        <button
          type="button"
          onClick={() => setResetSuccess(false)}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Войти
        </button>
      </motion.div>
    )
  }

  // Forgot password form
  if (showForgotPassword) {
    if (forgotPasswordSent) {
      return (
        <motion.div
          className="text-center space-y-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.3 }}
        >
          <motion.div
            className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
          >
            <Mail className="text-green" size={24} />
          </motion.div>
          <h2 className="text-xl font-semibold font-display">
            Проверьте почту
          </h2>
          <p className="text-text-secondary text-sm leading-relaxed">
            Если аккаунт с таким email существует, мы отправили ссылку для сброса пароля.
          </p>
          <button
            type="button"
            onClick={() => {
              setForgotPasswordSent(false)
              setShowForgotPassword(false)
            }}
            className="text-sm text-accent hover:text-accent-hover transition-colors"
          >
            Вернуться к входу
          </button>
        </motion.div>
      )
    }

    return (
      <motion.div
        className="space-y-6"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.25 }}
      >
        <div>
          <h2 className="text-xl font-semibold font-display mb-1">
            Забыли пароль?
          </h2>
          <p className="text-text-secondary text-sm">
            Введите email и мы отправим ссылку для сброса пароля
          </p>
        </div>

        <form onSubmit={forgotForm.handleSubmit(handleForgotPassword)} className="space-y-4">
          <Input
            label="Email"
            type="email"
            placeholder="you@example.com"
            icon={<Mail size={16} />}
            {...forgotForm.register('email')}
            error={forgotForm.formState.errors.email?.message}
          />
          <Button type="submit" loading={isLoading} className="w-full">
            <KeyRound size={16} />
            Отправить ссылку
          </Button>
        </form>

        <div className="text-center">
          <button
            type="button"
            onClick={() => setShowForgotPassword(false)}
            className="text-sm text-text-secondary hover:text-text transition-colors"
          >
            Вернуться к входу
          </button>
        </div>
      </motion.div>
    )
  }

  if (magicLinkSent) {
    return (
      <motion.div
        className="text-center space-y-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
      >
        <motion.div
          className="w-12 h-12 rounded-full bg-green/10 flex items-center justify-center mx-auto"
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.1 }}
        >
          <Check className="text-green" size={24} />
        </motion.div>
        <h2 className="text-xl font-semibold font-display">
          Проверьте почту
        </h2>
        <p className="text-text-secondary text-sm leading-relaxed">
          Мы отправили ссылку для входа на вашу почту.
          Перейдите по ней, чтобы войти в систему.
        </p>
        <button
          type="button"
          onClick={() => {
            setMagicLinkSent(false)
            setUseMagicLink(false)
          }}
          className="text-sm text-accent hover:text-accent-hover transition-colors"
        >
          Вернуться к входу
        </button>
      </motion.div>
    )
  }

  return (
    <AnimatePresence mode="wait">
      {useMagicLink ? (
        <motion.div
          key="magic"
          className="space-y-6"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.25 }}
        >
          <div>
            <h2 className="text-xl font-semibold font-display mb-1">
              Вход по ссылке
            </h2>
            <p className="text-text-secondary text-sm">
              Введите email и мы отправим вам ссылку для входа
            </p>
          </div>

          <form onSubmit={magicForm.handleSubmit(handleMagicLink)} className="space-y-4">
            <Input
              label="Email"
              type="email"
              placeholder="you@example.com"
              icon={<Mail size={16} />}
              {...magicForm.register('email')}
              error={magicForm.formState.errors.email?.message}
            />

            <Button type="submit" loading={isLoading} className="w-full">
              <Wand2 size={16} />
              Отправить ссылку
            </Button>
          </form>

          <div className="text-center">
            <button
              type="button"
              onClick={() => setUseMagicLink(false)}
              className="text-sm text-text-secondary hover:text-text transition-colors"
            >
              Войти с паролем
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="login"
          className="space-y-6"
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.25 }}
        >
          <motion.div
            custom={0}
            variants={staggerItem}
            initial="hidden"
            animate="visible"
          >
            <h2 className="text-xl font-semibold font-display mb-1">Вход</h2>
            <p className="text-text-secondary text-sm">
              Введите данные для входа в личный кабинет
            </p>
          </motion.div>

          <form onSubmit={loginForm.handleSubmit(handleLogin)} className="space-y-4">
            <motion.div custom={1} variants={staggerItem} initial="hidden" animate="visible">
              <Input
                label="Email"
                type="email"
                placeholder="you@example.com"
                icon={<Mail size={16} />}
                {...loginForm.register('email')}
                error={loginForm.formState.errors.email?.message}
              />
            </motion.div>

            <motion.div custom={2} variants={staggerItem} initial="hidden" animate="visible">
              <Input
                label="Пароль"
                type="password"
                placeholder="Введите пароль"
                icon={<Lock size={16} />}
                {...loginForm.register('password')}
                error={loginForm.formState.errors.password?.message}
              />
            </motion.div>

            <motion.div custom={3} variants={staggerItem} initial="hidden" animate="visible" className="flex items-center gap-2">
              <input
                type="checkbox"
                id="remember"
                {...loginForm.register('remember')}
                className="
                  w-4 h-4 rounded border-border bg-bg-card
                  text-accent focus:ring-accent/30
                  accent-accent
                "
              />
              <label
                htmlFor="remember"
                className="text-sm text-text-secondary cursor-pointer select-none"
              >
                Запомнить меня
              </label>
            </motion.div>

            <motion.div custom={4} variants={staggerItem} initial="hidden" animate="visible">
              <Button type="submit" loading={isLoading} className="w-full">
                <Lock size={16} />
                Войти
              </Button>
            </motion.div>
          </form>

          <motion.div custom={5} variants={staggerItem} initial="hidden" animate="visible" className="space-y-3 text-center">
            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => setUseMagicLink(true)}
                className="text-sm text-text-secondary hover:text-text transition-colors"
              >
                Войти по ссылке на email
              </button>
              <span className="text-text-muted">|</span>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-sm text-text-secondary hover:text-text transition-colors"
              >
                Забыли пароль?
              </button>
            </div>

            <p className="text-xs text-text-muted">
              Получили приглашение?{' '}
              <Link
                to="/register/invite"
                className="text-accent hover:text-accent-hover transition-colors"
              >
                Зарегистрироваться
              </Link>
            </p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
