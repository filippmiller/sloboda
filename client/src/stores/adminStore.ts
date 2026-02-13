import { create } from 'zustand'
import adminApi from '@/services/adminApi'
import type { Admin } from '@/types'

interface AdminState {
  admin: Admin | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAdminStore = create<AdminState>((set) => ({
  admin: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (email: string, password: string, rememberMe = false) => {
    const response = await adminApi.post('/auth/login', { email, password, rememberMe })
    const admin = response.data.admin
    if (response.data.mustChangePassword) {
      admin.mustChangePassword = true
    }
    set({
      admin,
      isAuthenticated: true,
      isLoading: false,
    })
  },

  logout: async () => {
    await adminApi.post('/auth/logout')
    set({
      admin: null,
      isAuthenticated: false,
      isLoading: false,
    })
  },

  checkAuth: async () => {
    try {
      const response = await adminApi.get('/auth/me')
      set({
        admin: response.data.admin,
        isAuthenticated: true,
        isLoading: false,
      })
    } catch {
      set({
        admin: null,
        isAuthenticated: false,
        isLoading: false,
      })
    }
  },
}))
