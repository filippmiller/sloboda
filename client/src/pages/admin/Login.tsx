import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '@/stores/adminStore'
import { ROUTES } from '@/config/routes'
import { toast } from 'sonner'
import { Shield, LogIn } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import type { AxiosError } from 'axios'

export default function AdminLogin() {
  const navigate = useNavigate()
  const login = useAdminStore((s) => s.login)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email || !password) {
      toast.error('Введите email и пароль')
      return
    }

    setLoading(true)
    try {
      await login(email, password, rememberMe)
      const admin = useAdminStore.getState().admin
      if (admin?.mustChangePassword) {
        toast.info('Необходимо сменить пароль')
        navigate(ROUTES.ADMIN_CHANGE_PASSWORD)
      } else {
        toast.success('Добро пожаловать')
        navigate(ROUTES.ADMIN_DASHBOARD)
      }
    } catch (err) {
      const axiosError = err as AxiosError<{ error: string }>
      const message = axiosError.response?.data?.error || 'Ошибка входа'
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Shield size={24} className="text-accent" />
            <h1 className="text-2xl font-bold font-display text-text tracking-tight">
              ADMIN
            </h1>
          </div>
          <p className="text-text-secondary text-sm">
            Панель управления SLOBODA
          </p>
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@sloboda.land"
              autoComplete="email"
              autoFocus
            />

            <Input
              label="Пароль"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="..."
              autoComplete="current-password"
            />

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-bg-card text-accent
                  focus:ring-accent/30 focus:ring-2"
              />
              <span className="text-sm text-text-secondary">
                Запомнить меня
              </span>
            </label>

            <Button
              type="submit"
              loading={loading}
              className="w-full mt-2"
            >
              <LogIn size={16} />
              Войти
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
