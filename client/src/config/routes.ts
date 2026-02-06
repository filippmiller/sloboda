export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register/:token',

  // User portal
  DASHBOARD: '/dashboard',
  NEWS: '/news',
  LIBRARY: '/library',
  SUBMIT: '/submit',
  PROFILE: '/profile',

  // Admin
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin',
  ADMIN_REGISTRATIONS: '/admin/registrations',
  ADMIN_USERS: '/admin/users',
  ADMIN_POSTS: '/admin/posts',
  ADMIN_KNOWLEDGE: '/admin/knowledge',
  ADMIN_CATEGORIES: '/admin/categories',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_ANALYTICS: '/admin/analytics',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]
