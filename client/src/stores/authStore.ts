import { create } from 'zustand'
import api from '@/services/api'
import type { User } from '@/types'

interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string) => {
    const response = await api.post('/user/auth/login', { email, password })
    set({
      user: response.data.user,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  logout: async () => {
    await api.post('/user/auth/logout')
    set({
      user: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  checkAuth: async () => {
    try {
      const response = await api.get('/user/auth/me')
      set({
        user: response.data.user,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      set({
        user: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },
}))
