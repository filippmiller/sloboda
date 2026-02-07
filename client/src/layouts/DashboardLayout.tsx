import { useState, useEffect, useCallback } from 'react'
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/stores/authStore'
import api from '@/services/api'
import {
  LayoutDashboard,
  Newspaper,
  BookOpen,
  Sparkles,
  Upload,
  Bookmark,
  Wallet,
  User,
  LogOut,
  Bell,
  Menu,
  X,
} from 'lucide-react'

const navItems = [
  { to: ROUTES.DASHBOARD, label: 'Главная', icon: LayoutDashboard },
  { to: ROUTES.NEWS, label: 'Новости', icon: Newspaper },
  { to: ROUTES.LIBRARY, label: 'Библиотека', icon: BookOpen },
  { to: ROUTES.LIBRARIAN, label: 'Библиотекарь', icon: Sparkles },
  { to: ROUTES.FINANCE, label: 'Финансы', icon: Wallet },
  { to: ROUTES.BOOKMARKS, label: 'Закладки', icon: Bookmark },
  { to: ROUTES.SUBMIT, label: 'Предложить', icon: Upload },
  { to: ROUTES.PROFILE, label: 'Профиль', icon: User },
]

export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const logout = useAuthStore((s) => s.logout)
  const [unreadCount, setUnreadCount] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)

  const fetchNotificationCount = useCallback(async () => {
    try {
      const res = await api.get('/user/notifications')
      setUnreadCount(res.data.data?.unreadCount ?? 0)
    } catch {
      // Non-critical
    }
  }, [])

  useEffect(() => {
    fetchNotificationCount()
    const interval = setInterval(fetchNotificationCount, 60000)
    return () => clearInterval(interval)
  }, [fetchNotificationCount])

  useEffect(() => {
    setMobileOpen(false)
  }, [location.pathname])

  const handleLogout = async () => {
    await logout()
    navigate(ROUTES.LOGIN)
  }

  const sidebarContent = (
    <>
      <div className="p-6 flex items-center justify-between">
        <h1 className="text-xl font-bold font-display text-text tracking-tight">
          <span className="text-accent drop-shadow-[0_0_8px_var(--color-accent-glow)]">S</span>LOBODA
        </h1>
        <button
          onClick={() => navigate(ROUTES.NOTIFICATIONS)}
          className="relative p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors"
          title="Уведомления"
        >
          <Bell size={18} />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-accent text-white text-[10px] font-bold leading-none animate-glow-pulse">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Accent line */}
      <div className="h-px bg-gradient-to-r from-transparent via-accent/20 to-transparent mx-4" />

      <nav className="flex-1 px-3 mt-3 relative">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
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
                    layoutId="sidebar-active"
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
        <h1 className="text-lg font-bold font-display text-text tracking-tight">
          <span className="text-accent">S</span>LOBODA
        </h1>
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
