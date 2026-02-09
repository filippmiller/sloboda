// Forum state management with Zustand
import { create } from 'zustand';
import axios from 'axios';

interface Thread {
  id: number;
  title: string;
  body?: string;
  type: string;
  author_id: number;
  author_name: string;
  category_id?: number;
  category_name?: string;
  vote_count: number;
  user_vote: 1 | -1 | 0 | null;
  comment_count: number;
  view_count: number;
  is_pinned: boolean;
  is_locked: boolean;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  last_activity_at: string;
}

interface Comment {
  id: number;
  body: string;
  thread_id: number;
  parent_comment_id?: number | null;
  author_id: number;
  author_name: string;
  vote_count: number;
  user_vote: 1 | -1 | 0 | null;
  depth: number;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
  replies?: Comment[];
}

interface UserRole {
  role: string;
  level: number;
  reputation: number;
  can_comment: boolean;
  can_create_threads: boolean;
  can_vote: boolean;
  can_edit_own: boolean;
  can_delete_own: boolean;
}

interface ForumState {
  // Threads
  threads: Thread[];
  currentThread: Thread | null;
  threadsLoading: boolean;
  threadsError: string | null;

  // Comments
  comments: Comment[];
  commentsLoading: boolean;
  commentsError: string | null;

  // User role
  userRole: UserRole | null;
  roleLoading: boolean;

  // Filters
  sortBy: 'hot' | 'recent' | 'top' | 'controversial';
  categoryFilter: number | null;

  // Actions - Threads
  fetchThreads: (filters?: { category?: number; sort?: string }) => Promise<void>;
  fetchThread: (id: number) => Promise<void>;
  createThread: (data: { title: string; body?: string; category_id?: number; type?: string }) => Promise<Thread>;
  updateThread: (id: number, data: { title?: string; body?: string }) => Promise<void>;
  deleteThread: (id: number, reason?: string) => Promise<void>;
  voteThread: (id: number, value: 1 | -1 | 0) => Promise<void>;

  // Actions - Comments
  fetchComments: (threadId: number) => Promise<void>;
  createComment: (threadId: number, body: string, parentCommentId?: number) => Promise<Comment>;
  updateComment: (id: number, body: string) => Promise<void>;
  deleteComment: (id: number) => Promise<void>;
  voteComment: (id: number, value: 1 | -1 | 0) => Promise<void>;

  // Actions - User Role
  fetchUserRole: () => Promise<void>;

  // Actions - Filters
  setSortBy: (sort: 'hot' | 'recent' | 'top' | 'controversial') => void;
  setCategoryFilter: (categoryId: number | null) => void;

  // Utilities
  clearErrors: () => void;
  reset: () => void;
}

export const useForumStore = create<ForumState>((set, get) => ({
  // Initial state
  threads: [],
  currentThread: null,
  threadsLoading: false,
  threadsError: null,

  comments: [],
  commentsLoading: false,
  commentsError: null,

  userRole: null,
  roleLoading: false,

  sortBy: 'hot',
  categoryFilter: null,

  // Thread actions
  fetchThreads: async (filters = {}) => {
    set({ threadsLoading: true, threadsError: null });
    try {
      const params = new URLSearchParams();
      if (filters.category) params.append('category', filters.category.toString());
      if (filters.sort) params.append('sort', filters.sort);
      else params.append('sort', get().sortBy);

      const response = await axios.get(`/api/forum/threads?${params}`);
      set({ threads: response.data.threads, threadsLoading: false });
    } catch (error: any) {
      set({
        threadsError: error.response?.data?.error || 'Failed to load threads',
        threadsLoading: false
      });
    }
  },

  fetchThread: async (id: number) => {
    set({ threadsLoading: true, threadsError: null });
    try {
      const response = await axios.get(`/api/forum/threads/${id}`);
      set({
        currentThread: response.data.thread,
        comments: response.data.comments || [],
        threadsLoading: false
      });
    } catch (error: any) {
      set({
        threadsError: error.response?.data?.error || 'Failed to load thread',
        threadsLoading: false
      });
    }
  },

  createThread: async (data) => {
    const response = await axios.post('/api/forum/threads', data);
    const newThread = response.data.thread;
    set(state => ({
      threads: [newThread, ...state.threads]
    }));
    return newThread;
  },

  updateThread: async (id, data) => {
    await axios.put(`/api/forum/threads/${id}`, data);
    set(state => ({
      threads: state.threads.map(t => t.id === id ? { ...t, ...data } : t),
      currentThread: state.currentThread?.id === id ? { ...state.currentThread, ...data } : state.currentThread
    }));
  },

  deleteThread: async (id, reason) => {
    await axios.delete(`/api/forum/threads/${id}`, { data: { reason } });
    set(state => ({
      threads: state.threads.filter(t => t.id !== id)
    }));
  },

  voteThread: async (id, value) => {
    const response = await axios.post('/api/votes', {
      comment_id: null,
      thread_id: id,
      vote_value: value
    });

    const { vote_count, user_vote } = response.data;

    set(state => ({
      threads: state.threads.map(t =>
        t.id === id ? { ...t, vote_count, user_vote } : t
      ),
      currentThread: state.currentThread?.id === id
        ? { ...state.currentThread, vote_count, user_vote }
        : state.currentThread
    }));
  },

  // Comment actions
  fetchComments: async (threadId: number) => {
    set({ commentsLoading: true, commentsError: null });
    try {
      const response = await axios.get(`/api/forum/threads/${threadId}`);
      set({
        comments: response.data.comments || [],
        commentsLoading: false
      });
    } catch (error: any) {
      set({
        commentsError: error.response?.data?.error || 'Failed to load comments',
        commentsLoading: false
      });
    }
  },

  createComment: async (threadId, body, parentCommentId) => {
    const response = await axios.post('/api/comments', {
      thread_id: threadId,
      body,
      parent_comment_id: parentCommentId || null
    });

    const newComment = response.data.comment;

    // Add comment to state
    set(state => ({
      comments: [...state.comments, newComment],
      currentThread: state.currentThread
        ? { ...state.currentThread, comment_count: state.currentThread.comment_count + 1 }
        : null
    }));

    return newComment;
  },

  updateComment: async (id, body) => {
    await axios.put(`/api/comments/${id}`, { body });
    set(state => ({
      comments: state.comments.map(c => c.id === id ? { ...c, body } : c)
    }));
  },

  deleteComment: async (id) => {
    await axios.delete(`/api/comments/${id}`);
    set(state => ({
      comments: state.comments.map(c =>
        c.id === id ? { ...c, is_deleted: true, body: '[deleted]' } : c
      )
    }));
  },

  voteComment: async (id, value) => {
    const response = await axios.post('/api/votes', {
      comment_id: id,
      vote_value: value
    });

    const { vote_count, user_vote } = response.data;

    set(state => ({
      comments: state.comments.map(c =>
        c.id === id ? { ...c, vote_count, user_vote } : c
      )
    }));
  },

  // User role actions
  fetchUserRole: async () => {
    set({ roleLoading: true });
    try {
      const response = await axios.get('/api/roles/user/me');
      set({ userRole: response.data.role, roleLoading: false });
    } catch (error) {
      set({ roleLoading: false });
    }
  },

  // Filter actions
  setSortBy: (sort) => {
    set({ sortBy: sort });
    get().fetchThreads();
  },

  setCategoryFilter: (categoryId) => {
    set({ categoryFilter: categoryId });
    get().fetchThreads({ category: categoryId || undefined });
  },

  // Utilities
  clearErrors: () => {
    set({ threadsError: null, commentsError: null });
  },

  reset: () => {
    set({
      threads: [],
      currentThread: null,
      comments: [],
      threadsError: null,
      commentsError: null,
      sortBy: 'hot',
      categoryFilter: null
    });
  }
}));
