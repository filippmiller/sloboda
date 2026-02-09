export const ROUTES = {
  HOME: '/',
  LOGIN: '/login',
  REGISTER: '/register/:token',

  // User portal
  DASHBOARD: '/dashboard',
  NEWS: '/news',
  LIBRARY: '/library',
  LIBRARIAN: '/librarian',
  SUBMIT: '/submit',
  FINANCE: '/finance',
  BOOKMARKS: '/bookmarks',
  NOTIFICATIONS: '/notifications',
  PROFILE: '/profile',
  FORUM: '/forum',
  FORUM_THREAD: '/forum/thread/:id',
  FORUM_CREATE: '/forum/create',

  // Admin
  ADMIN_LOGIN: '/admin/login',
  ADMIN_DASHBOARD: '/admin',
  ADMIN_REGISTRATIONS: '/admin/registrations',
  ADMIN_USERS: '/admin/users',
  ADMIN_POSTS: '/admin/posts',
  ADMIN_KNOWLEDGE: '/admin/knowledge',
  ADMIN_CATEGORIES: '/admin/categories',
  ADMIN_CAMPAIGNS: '/admin/campaigns',
  ADMIN_ADMINS: '/admin/admins',
  ADMIN_SETTINGS: '/admin/settings',
  ADMIN_ANALYTICS: '/admin/analytics',
  ADMIN_FINANCE: '/admin/finance',
  ADMIN_FORUM: '/admin/forum',
  ADMIN_FORUM_ROLES: '/admin/forum/roles',
  ADMIN_FORUM_MODERATION: '/admin/forum/moderation',
} as const

export type RoutePath = (typeof ROUTES)[keyof typeof ROUTES]
