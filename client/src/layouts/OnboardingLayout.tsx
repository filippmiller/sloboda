import { useEffect } from 'react'
import { Outlet, useNavigate, useSearchParams } from 'react-router-dom'
import { ROUTES } from '@/config/routes'
import { useAuthStore } from '@/stores/authStore'
import { getSafeRedirectPath } from '@/types/core'
import { Loader2 } from 'lucide-react'

export default function OnboardingLayout() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { user, isAuthenticated, isLoading, checkAuth } = useAuthStore()

  useEffect(() => {
    checkAuth()
  }, [checkAuth])

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      const target = getSafeRedirectPath(searchParams.get('redirect'), '')
      const loginUrl = target ? `${ROUTES.LOGIN}?redirect=${encodeURIComponent(target)}` : ROUTES.LOGIN
      navigate(loginUrl, { replace: true })
    }
    // If onboarding already done, go to redirect target or dashboard
    if (!isLoading && user?.onboardingCompletedAt) {
      const target = getSafeRedirectPath(searchParams.get('redirect'), ROUTES.DASHBOARD)
      navigate(target, { replace: true })
    }
  }, [isLoading, isAuthenticated, user, navigate, searchParams])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-bg">
      <div className="max-w-2xl mx-auto px-4 py-8 md:py-16">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold font-display text-text tracking-tight">
            <span className="text-accent drop-shadow-[0_0_8px_var(--color-accent-glow)]">S</span>LOBODA
          </h1>
        </div>
        <Outlet />
      </div>
    </div>
  )
}
