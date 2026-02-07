import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ROUTES } from '@/config/routes'

// Layouts loaded eagerly — needed immediately for route groups
import AuthLayout from '@/layouts/AuthLayout'
import DashboardLayout from '@/layouts/DashboardLayout'
import AdminLayout from '@/layouts/AdminLayout'

// Lazy-loaded page components
const Login = lazy(() => import('@/pages/auth/Login'))
const Register = lazy(() => import('@/pages/auth/Register'))

const UserDashboard = lazy(() => import('@/pages/user/Dashboard'))
const News = lazy(() => import('@/pages/user/News'))
const Library = lazy(() => import('@/pages/user/Library'))
const Librarian = lazy(() => import('@/pages/user/Librarian'))
const KnowledgeSubmit = lazy(() => import('@/pages/user/KnowledgeSubmit'))
const Finance = lazy(() => import('@/pages/user/Finance'))
const Bookmarks = lazy(() => import('@/pages/user/Bookmarks'))
const Notifications = lazy(() => import('@/pages/user/Notifications'))
const Profile = lazy(() => import('@/pages/user/Profile'))

const AdminLogin = lazy(() => import('@/pages/admin/Login'))
const AdminDashboard = lazy(() => import('@/pages/admin/Dashboard'))
const Registrations = lazy(() => import('@/pages/admin/Registrations'))
const Users = lazy(() => import('@/pages/admin/Users'))
const Posts = lazy(() => import('@/pages/admin/Posts'))
const Knowledge = lazy(() => import('@/pages/admin/Knowledge'))
const Categories = lazy(() => import('@/pages/admin/Categories'))
const Campaigns = lazy(() => import('@/pages/admin/Campaigns'))
const Admins = lazy(() => import('@/pages/admin/Admins'))
const Settings = lazy(() => import('@/pages/admin/Settings'))
const Analytics = lazy(() => import('@/pages/admin/Analytics'))
const AdminFinance = lazy(() => import('@/pages/admin/Finance'))

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 size={28} className="animate-spin text-accent" />
    </div>
  )
}

function App() {
  return (
    <Suspense fallback={<LoadingSpinner />}>
      <Routes>
        {/* Landing redirect */}
        <Route path={ROUTES.HOME} element={<Navigate to={ROUTES.LOGIN} replace />} />

        {/* Auth routes */}
        <Route element={<AuthLayout />}>
          <Route path={ROUTES.LOGIN} element={<Login />} />
          <Route path={ROUTES.REGISTER} element={<Register />} />
        </Route>

        {/* User portal routes */}
        <Route element={<DashboardLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<UserDashboard />} />
          <Route path={ROUTES.NEWS} element={<News />} />
          <Route path={ROUTES.LIBRARY} element={<Library />} />
          <Route path={ROUTES.LIBRARIAN} element={<Librarian />} />
          <Route path={ROUTES.SUBMIT} element={<KnowledgeSubmit />} />
          <Route path={ROUTES.FINANCE} element={<Finance />} />
          <Route path={ROUTES.BOOKMARKS} element={<Bookmarks />} />
          <Route path={ROUTES.NOTIFICATIONS} element={<Notifications />} />
          <Route path={ROUTES.PROFILE} element={<Profile />} />
        </Route>

        {/* Admin login (no layout) */}
        <Route path={ROUTES.ADMIN_LOGIN} element={<AdminLogin />} />

        {/* Admin routes (with sidebar layout + auth check) */}
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.ADMIN_DASHBOARD} element={<AdminDashboard />} />
          <Route path={ROUTES.ADMIN_REGISTRATIONS} element={<Registrations />} />
          <Route path={ROUTES.ADMIN_USERS} element={<Users />} />
          <Route path={ROUTES.ADMIN_POSTS} element={<Posts />} />
          <Route path={ROUTES.ADMIN_KNOWLEDGE} element={<Knowledge />} />
          <Route path={ROUTES.ADMIN_CATEGORIES} element={<Categories />} />
          <Route path={ROUTES.ADMIN_CAMPAIGNS} element={<Campaigns />} />
          <Route path={ROUTES.ADMIN_ADMINS} element={<Admins />} />
          <Route path={ROUTES.ADMIN_SETTINGS} element={<Settings />} />
          <Route path={ROUTES.ADMIN_ANALYTICS} element={<Analytics />} />
          <Route path={ROUTES.ADMIN_FINANCE} element={<AdminFinance />} />
        </Route>

        {/* Catch all */}
        <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
      </Routes>
    </Suspense>
  )
}

export default App
