import axios from 'axios'
import { toast } from 'sonner'

const adminApi = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

let redirecting = false

adminApi.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !redirecting) {
      const isAdminLogin = window.location.pathname === '/admin/login'
      if (!isAdminLogin && window.location.pathname.startsWith('/admin')) {
        redirecting = true
        toast.error('Сессия истекла. Войдите снова.')
        setTimeout(() => {
          window.location.replace('/admin/login')
        }, 300)
      }
    }

    // Retry logic for transient server errors (GET only)
    const config = error.config
    if (
      error.response?.status >= 500 &&
      config &&
      config.method === 'get' &&
      (!config._retryCount || config._retryCount < 2)
    ) {
      config._retryCount = (config._retryCount || 0) + 1
      const delay = config._retryCount * 1000
      return new Promise(resolve => setTimeout(resolve, delay)).then(() => adminApi(config))
    }

    return Promise.reject(error)
  },
)

export default adminApi
