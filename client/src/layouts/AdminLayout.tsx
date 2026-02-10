import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate, useLocation, Navigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
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
  Wallet,
  Mail,
  ShieldCheck,
  LogOut,
  Shield,
  Menu,
  X,
  MessageSquare,
  Globe,
} from 'lucide-react'
import Skeleton from '@/components/ui/Skeleton'

const navItems = [
  { to: ROUTES.ADMIN_DASHBOARD, label: 'Обзор', icon: LayoutDashboard },
  { to: ROUTES.ADMIN_REGISTRATIONS, label: 'Заявки', icon: UserPlus },
  { to: ROUTES.ADMIN_USERS, label: 'Пользователи', icon: Users },
  { to: ROUTES.ADMIN_FORUM, label: 'Форум', icon: MessageSquare },
  { to: ROUTES.ADMIN_POSTS, label: 'Публикации', icon: FileText },
  { to: ROUTES.ADMIN_KNOWLEDGE, label: 'Знания', icon: Lightbulb },
  { to: ROUTES.ADMIN_CATEGORIES, label: 'Категории', icon: Tags },
  { to: ROUTES.ADMIN_FINANCE, label: 'Финансы', icon: Wallet },
  { to: ROUTES.ADMIN_LANDING, label: 'Главная страница', icon: Globe },
  { to: ROUTES.ADMIN_CAMPAIGNS, label: 'Рассылки', icon: Mail },
  { to: ROUTES.ADMIN_ANALYTICS, label: 'Аналитика', icon: BarChart3 },
  { to: ROUTES.ADMIN_ADMINS, label: 'Администраторы', icon: ShieldCheck },
  { to: ROUTES.ADMIN_SETTINGS, label: 'Настройки', icon: Settings },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { admin, isAuthenticated, isLoading, logout, checkAuth } = useAdminStore()
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.ADMIN_LOGIN)
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center">
            <Shield className="text-accent animate-glow-pulse" size={24} />
          </div>
          <Skeleton variant="line" className="w-32 h-3" />
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.ADMIN_LOGIN} replace />
  }

  const sidebarContent = (
    <>
      <div className="p-6 flex items-center gap-2">
        <div className="p-1.5 rounded-lg bg-accent/10 shadow-[0_0_12px_var(--color-accent-glow)]">
          <Shield size={18} className="text-accent" />
        </div>
        <h1 className="text-xl font-bold font-display text-text tracking-tight">
          ADMIN
        </h1>
      </div>

      <div className="h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent mx-4" />

      <nav className="flex-1 px-3 mt-3 overflow-y-auto relative">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === ROUTES.ADMIN_DASHBOARD}
            className={({ isActive }) =>
              `relative flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium
               transition-all duration-200 mb-1 group
               ${isActive
                ? 'text-accent bg-accent/5'
                : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
              }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="admin-sidebar-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-accent shadow-[0_0_8px_var(--color-accent-glow)]"
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon size={18} className="transition-transform duration-200 group-hover:scale-105" />
                {item.label}
              </>
            )}
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
    </>
  )

  return (
    <div className="min-h-screen bg-bg flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 bg-gradient-to-b from-bg-card to-bg border-r border-border flex-col fixed h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile header */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-bg-card/80 backdrop-blur-lg border-b border-border px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield size={16} className="text-accent" />
          <h1 className="text-lg font-bold font-display text-text tracking-tight">ADMIN</h1>
        </div>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-lg text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
        >
          {mobileOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      </div>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="md:hidden fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileOpen(false)}
            />
            <motion.aside
              className="md:hidden fixed top-0 left-0 bottom-0 w-60 bg-bg-card border-r border-border flex flex-col z-50"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Main content */}
      <main className="flex-1 md:ml-60 p-6 md:p-8 mt-14 md:mt-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  )
}
