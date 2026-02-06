import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/stores/authStore'
import {
  LayoutDashboard,
  Newspaper,
  BookOpen,
  Upload,
  User,
  LogOut,
} from 'lucide-react'

const navItems = [
  { to: ROUTES.DASHBOARD, label: 'Главная', icon: LayoutDashboard },
  { to: ROUTES.NEWS, label: 'Новости', icon: Newspaper },
  { to: ROUTES.LIBRARY, label: 'Библиотека', icon: BookOpen },
  { to: ROUTES.SUBMIT, label: 'Предложить', icon: Upload },
  { to: ROUTES.PROFILE, label: 'Профиль', icon: User },
]

export default function DashboardLayout() {
  const navigate = useNavigate()
  const logout = useAuthStore((s) => s.logout)

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.LOGIN)
  }

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Sidebar */}
      <aside className="w-60 bg-bg-card border-r border-border flex flex-col fixed h-screen">
        <div className="p-6">
          <h1 className="text-xl font-bold font-display text-text tracking-tight">
            SLOBODA
          </h1>
        </div>

        <nav className="flex-1 px-3">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
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
