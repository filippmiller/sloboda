import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAdminStore } from '@/stores/adminStore'
import { ROUTES } from '@/config/routes'
import adminApi from '@/services/adminApi'
import { toast } from 'sonner'
import { Shield, KeyRound } from 'lucide-react'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'

export default function ChangePassword() {
  const navigate = useNavigate()
  const { admin, checkAuth } = useAdminStore()

  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const isForced = admin?.mustChangePassword

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPassword || newPassword.length < 8) {
      toast.error('Пароль должен быть не менее 8 символов')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Пароли не совпадают')
      return
    }

    setLoading(true)
    try {
      await adminApi.post('/auth/change-password', { newPassword })
      toast.success('Пароль успешно изменён')
      // Refresh admin data to clear mustChangePassword flag
      await checkAuth()
      navigate(ROUTES.ADMIN_DASHBOARD)
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Ошибка смены пароля'
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
          {isForced ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3 text-sm text-amber-400">
              Вам необходимо сменить пароль перед началом работы
            </div>
          ) : (
            <p className="text-text-secondary text-sm">Смена пароля</p>
          )}
        </div>

        <div className="bg-bg-card border border-border rounded-xl p-8">
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <Input
              label="Новый пароль"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Минимум 8 символов"
              autoComplete="new-password"
              autoFocus
            />

            <Input
              label="Подтвердите пароль"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Повторите пароль"
              autoComplete="new-password"
            />

            <Button
              type="submit"
              loading={loading}
              className="w-full mt-2"
            >
              <KeyRound size={16} />
              Сменить пароль
            </Button>
          </form>
        </div>
      </div>
    </div>
  )
}
