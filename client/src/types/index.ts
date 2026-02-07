export interface User {
  id: string
  email: string
  name: string
  role: 'user' | 'admin' | 'super_admin'
  avatar_url?: string
  telegram?: string
  location?: string
  last_login_at?: string
  created_at: string
  updated_at: string
}

export interface Admin {
  id: number
  email: string
  name: string
  role: 'admin' | 'super_admin'
}

export interface Post {
  id: number
  title: string
  slug: string
  summary?: string
  body: string
  type: 'news' | 'article' | 'newsletter' | 'knowledge'
  status: 'draft' | 'published' | 'archived'
  category_id?: number
  category_name?: string
  author_admin_id?: number
  author_user_id?: number
  featured_image?: string
  is_pinned?: boolean
  tags?: string[]
  views?: number
  published_at?: string
  created_at: string
  updated_at: string
}

export interface KnowledgeSubmission {
  id: number
  title: string
  description: string
  body?: string
  user_id: number
  user_name?: string
  user_email?: string
  suggested_category_id?: number
  status: 'pending' | 'reviewing' | 'approved' | 'rejected' | 'published'
  ai_category_id?: number
  ai_category_name?: string
  ai_tags?: string[]
  ai_summary?: string
  ai_confidence?: number
  final_category_id?: number
  review_notes?: string
  reviewed_by?: number
  reviewed_at?: string
  published_post_id?: number
  created_at: string
  updated_at: string
}

export interface Category {
  id: number
  name: string
  slug: string
  description?: string
  icon?: string
  sort_order: number
  created_at: string
}

export interface Registration {
  id: number
  name: string
  email: string
  phone?: string
  location?: string
  motivation?: string
  participation?: string
  skills?: string[]
  budget_range?: string
  status: 'new' | 'contacted' | 'qualified' | 'converted' | 'rejected'
  converted_to_user_id?: number
  notes?: RegistrationNote[]
  created_at: string
  updated_at: string
}

export interface RegistrationNote {
  id: number
  registration_id: number
  admin_id: number
  admin_name?: string
  content: string
  created_at: string
}

export interface PortalUser {
  id: number
  email: string
  name: string
  telegram?: string
  location?: string
  status: 'active' | 'suspended'
  last_login?: string
  created_at: string
}

export interface Setting {
  key: string
  value: string
  updated_by?: number
  updated_at?: string
}

export interface AnalyticsOverview {
  total_registrations: number
  this_week: number
  this_month: number
  by_status: Record<string, number>
}

export interface TimeSeriesPoint {
  date: string
  count: number
}

export interface BreakdownItem {
  label: string
  count: number
}

export interface AnalyticsBreakdown {
  motivation: BreakdownItem[]
  participation: BreakdownItem[]
  location: BreakdownItem[]
  skills: BreakdownItem[]
  budget: BreakdownItem[]
}

export interface Notification {
  id: number
  user_id: number
  type: string
  title: string
  message?: string
  link?: string
  is_read: boolean
  created_at: string
}

export interface BookmarkedPost extends Post {
  bookmarked_at: string
}

export interface InviteInfo {
  email: string
  name?: string
  expires_at: string
}

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export interface EmailTemplate {
  id: number
  name: string
  subject: string
  body: string
  created_by?: number
  created_at: string
  updated_at: string
}

export interface EmailCampaign {
  id: number
  template_id?: number
  subject: string
  body: string
  filters?: Record<string, string>
  recipient_count: number
  sent_count?: number
  opened_count?: number
  clicked_count?: number
  failed_count?: number
  status: 'draft' | 'sending' | 'sent' | 'failed'
  created_by?: number
  created_at: string
  sent_at?: string
}

export interface AdminUser {
  id: number
  email: string
  name: string
  role: 'admin' | 'super_admin'
  created_at: string
  last_login_at?: string
}

export interface AuthState {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}
