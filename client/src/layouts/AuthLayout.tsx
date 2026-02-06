import { Outlet } from 'react-router-dom'

export default function AuthLayout() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold font-display text-text tracking-tight">
            SLOBODA
          </h1>
          <p className="text-text-secondary mt-2 text-sm">
            Сообщество осознанной жизни
          </p>
        </div>
        <div className="bg-bg-card border border-border rounded-xl p-8">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
