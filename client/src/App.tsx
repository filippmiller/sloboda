import { Routes, Route, Navigate } from 'react-router-dom'
import { ROUTES } from '@/config/routes'

import AuthLayout from '@/layouts/AuthLayout'
import DashboardLayout from '@/layouts/DashboardLayout'
import AdminLayout from '@/layouts/AdminLayout'

import Login from '@/pages/auth/Login'
import Register from '@/pages/auth/Register'

import UserDashboard from '@/pages/user/Dashboard'
import News from '@/pages/user/News'
import Library from '@/pages/user/Library'
import KnowledgeSubmit from '@/pages/user/KnowledgeSubmit'
import Profile from '@/pages/user/Profile'

import AdminLogin from '@/pages/admin/Login'
import AdminDashboard from '@/pages/admin/Dashboard'
import Registrations from '@/pages/admin/Registrations'
import Users from '@/pages/admin/Users'
import Posts from '@/pages/admin/Posts'
import Knowledge from '@/pages/admin/Knowledge'
import Categories from '@/pages/admin/Categories'
import Settings from '@/pages/admin/Settings'
import Analytics from '@/pages/admin/Analytics'

function App() {
  return (
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
        <Route path={ROUTES.SUBMIT} element={<KnowledgeSubmit />} />
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
        <Route path={ROUTES.ADMIN_SETTINGS} element={<Settings />} />
        <Route path={ROUTES.ADMIN_ANALYTICS} element={<Analytics />} />
      </Route>

      {/* Catch all */}
      <Route path="*" element={<Navigate to={ROUTES.LOGIN} replace />} />
    </Routes>
  )
}

export default App
