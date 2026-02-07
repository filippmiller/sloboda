import axios from 'axios'
import { toast } from 'sonner'

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Debounce 401 redirects to prevent redirect storms from concurrent requests
let redirecting = false

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !redirecting) {
      const isAuthRoute = window.location.pathname.startsWith('/login') ||
        window.location.pathname.startsWith('/register')

      if (!isAuthRoute) {
        redirecting = true
        toast.error('Сессия истекла. Войдите снова.')
        setTimeout(() => {
          window.location.replace('/login')
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
      return new Promise(resolve => setTimeout(resolve, delay)).then(() => api(config))
    }

    return Promise.reject(error)
  },
)

export default api
