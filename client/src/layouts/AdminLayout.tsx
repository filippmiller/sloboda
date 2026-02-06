import { useEffect } from 'react'
import { Outlet, NavLink, useNavigate, Navigate } from 'react-router-dom'
import { ROUTES } from '@/config/routes'
import { useAdminStore } from '@/stores/adminStore'
import {
  LayoutDashboard,
  Users,
  UserPlus,
  FileText,
  Lightbulb,
  Tags,
  Settings,
  BarChart3,
  LogOut,
  Shield,
  Loader2,
} from 'lucide-react'

const navItems = [
  { to: ROUTES.ADMIN_DASHBOARD, label: 'Обзор', icon: LayoutDashboard },
  { to: ROUTES.ADMIN_REGISTRATIONS, label: 'Заявки', icon: UserPlus },
  { to: ROUTES.ADMIN_USERS, label: 'Пользователи', icon: Users },
  { to: ROUTES.ADMIN_POSTS, label: 'Публикации', icon: FileText },
  { to: ROUTES.ADMIN_KNOWLEDGE, label: 'Знания', icon: Lightbulb },
  { to: ROUTES.ADMIN_CATEGORIES, label: 'Категории', icon: Tags },
  { to: ROUTES.ADMIN_ANALYTICS, label: 'Аналитика', icon: BarChart3 },
  { to: ROUTES.ADMIN_SETTINGS, label: 'Настройки', icon: Settings },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { admin, isAuthenticated, isLoading, logout, checkAuth } = useAdminStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.ADMIN_LOGIN)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-accent" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.ADMIN_LOGIN} replace />
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-60 bg-bg-card border-r border-border flex flex-col fixed h-screen">
        <div className="p-6 flex items-center gap-2">
          <Shield size={20} className="text-accent" />
          <h1 className="text-xl font-bold font-display text-text tracking-tight">
            ADMIN
          </h1>
        </div>

        <nav className="flex-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === ROUTES.ADMIN_DASHBOARD}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
                 transition-colors duration-150 mb-1
                 ${isActive
                  ? 'bg-accent/10 text-accent'
                  : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
                }`
              }
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          {admin && (
            <div className="px-3 py-2 mb-2">
              <p className="text-xs font-medium text-text truncate">{admin.name}</p>
              <p className="text-xs text-text-muted truncate">{admin.email}</p>
            </div>
          )}
          <button
            onClick={handleLogout}
            className="
              flex items-center gap-3 w-full px-3 py-2.5 rounded-lg
              text-sm font-medium text-text-secondary
              hover:text-text hover:bg-bg-elevated
              transition-colors duration-150
            "
          >
            <LogOut size={18} />
            Выйти
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 ml-60 p-8">
        <Outlet />
      </main>
    </div>
  )
}
