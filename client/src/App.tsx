import { lazy, Suspense, type ReactNode } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { ROUTES } from '@/config/routes'
import RouteErrorBoundary from '@/components/RouteErrorBoundary'

// Layouts loaded eagerly — needed immediately for route groups
import AuthLayout from '@/layouts/AuthLayout'
import DashboardLayout from '@/layouts/DashboardLayout'
import OnboardingLayout from '@/layouts/OnboardingLayout'
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
const Onboarding = lazy(() => import('@/pages/user/Onboarding'))
const Map = lazy(() => import('@/pages/user/Map'))
const Badges = lazy(() => import('@/pages/user/Badges'))
const Forum = lazy(() => import('@/pages/Forum'))
const ThreadView = lazy(() => import('@/pages/ThreadView'))
const CreateThread = lazy(() => import('@/pages/CreateThread'))
const Events = lazy(() => import('@/pages/user/Events'))
const EventDetail = lazy(() => import('@/pages/user/EventDetail'))
const UserCampaigns = lazy(() => import('@/pages/user/Campaigns'))
const CampaignDetail = lazy(() => import('@/pages/user/CampaignDetail'))

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
const AdminLanding = lazy(() => import('@/pages/admin/LandingContent'))
const ForumThreads = lazy(() => import('@/pages/admin/ForumThreads'))
const ForumRoles = lazy(() => import('@/pages/admin/ForumRoles'))
const ForumModeration = lazy(() => import('@/pages/admin/ForumModeration'))
const NotFound = lazy(() => import('@/pages/NotFound'))

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[50vh]">
      <Loader2 size={28} className="animate-spin text-accent" />
    </div>
  )
}

/** Wraps a page component with error boundary so a crash doesn't kill the layout */
function Safe({ children }: { children: ReactNode }) {
  return <RouteErrorBoundary>{children}</RouteErrorBoundary>
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

        {/* Onboarding (authenticated, no sidebar) */}
        <Route element={<OnboardingLayout />}>
          <Route path={ROUTES.ONBOARDING} element={<Safe><Onboarding /></Safe>} />
        </Route>

        {/* User portal routes */}
        <Route element={<DashboardLayout />}>
          <Route path={ROUTES.DASHBOARD} element={<Safe><UserDashboard /></Safe>} />
          <Route path={ROUTES.NEWS} element={<Safe><News /></Safe>} />
          <Route path={ROUTES.LIBRARY} element={<Safe><Library /></Safe>} />
          <Route path={ROUTES.LIBRARIAN} element={<Safe><Librarian /></Safe>} />
          <Route path={ROUTES.SUBMIT} element={<Safe><KnowledgeSubmit /></Safe>} />
          <Route path={ROUTES.FINANCE} element={<Safe><Finance /></Safe>} />
          <Route path={ROUTES.BOOKMARKS} element={<Safe><Bookmarks /></Safe>} />
          <Route path={ROUTES.NOTIFICATIONS} element={<Safe><Notifications /></Safe>} />
          <Route path={ROUTES.PROFILE} element={<Safe><Profile /></Safe>} />
          <Route path={ROUTES.MAP} element={<Safe><Map /></Safe>} />
          <Route path={ROUTES.BADGES} element={<Safe><Badges /></Safe>} />
          <Route path={ROUTES.FORUM} element={<Safe><Forum /></Safe>} />
          <Route path={ROUTES.FORUM_THREAD} element={<Safe><ThreadView /></Safe>} />
          <Route path={ROUTES.FORUM_CREATE} element={<Safe><CreateThread /></Safe>} />
          <Route path={ROUTES.EVENTS} element={<Safe><Events /></Safe>} />
          <Route path={ROUTES.EVENT_DETAIL} element={<Safe><EventDetail /></Safe>} />
          <Route path={ROUTES.CAMPAIGNS} element={<Safe><UserCampaigns /></Safe>} />
          <Route path={ROUTES.CAMPAIGN_DETAIL} element={<Safe><CampaignDetail /></Safe>} />
        </Route>

        {/* Admin login (no layout) */}
        <Route path={ROUTES.ADMIN_LOGIN} element={<AdminLogin />} />

        {/* Admin routes (with sidebar layout + auth check) */}
        <Route element={<AdminLayout />}>
          <Route path={ROUTES.ADMIN_DASHBOARD} element={<Safe><AdminDashboard /></Safe>} />
          <Route path={ROUTES.ADMIN_REGISTRATIONS} element={<Safe><Registrations /></Safe>} />
          <Route path={ROUTES.ADMIN_USERS} element={<Safe><Users /></Safe>} />
          <Route path={ROUTES.ADMIN_POSTS} element={<Safe><Posts /></Safe>} />
          <Route path={ROUTES.ADMIN_KNOWLEDGE} element={<Safe><Knowledge /></Safe>} />
          <Route path={ROUTES.ADMIN_CATEGORIES} element={<Safe><Categories /></Safe>} />
          <Route path={ROUTES.ADMIN_CAMPAIGNS} element={<Safe><Campaigns /></Safe>} />
          <Route path={ROUTES.ADMIN_ADMINS} element={<Safe><Admins /></Safe>} />
          <Route path={ROUTES.ADMIN_SETTINGS} element={<Safe><Settings /></Safe>} />
          <Route path={ROUTES.ADMIN_ANALYTICS} element={<Safe><Analytics /></Safe>} />
          <Route path={ROUTES.ADMIN_FINANCE} element={<Safe><AdminFinance /></Safe>} />
          <Route path={ROUTES.ADMIN_LANDING} element={<Safe><AdminLanding /></Safe>} />
          <Route path={ROUTES.ADMIN_FORUM} element={<Safe><ForumThreads /></Safe>} />
          <Route path={ROUTES.ADMIN_FORUM_ROLES} element={<Safe><ForumRoles /></Safe>} />
          <Route path={ROUTES.ADMIN_FORUM_MODERATION} element={<Safe><ForumModeration /></Safe>} />
        </Route>

        {/* 404 */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

export default App
