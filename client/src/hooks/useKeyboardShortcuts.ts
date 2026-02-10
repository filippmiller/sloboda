import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useHotkeys } from 'react-hotkeys-hook'
import { ROUTES } from '@/config/routes'
import { toast } from 'sonner'

interface KeyboardShortcutsOptions {
  enabled?: boolean
  onHelpOpen?: () => void
}

/**
 * Global keyboard shortcuts hook
 * Provides navigation and action shortcuts for the app
 */
export function useKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true, onHelpOpen } = options
  const navigate = useNavigate()
  const [sequenceKey, setSequenceKey] = useState<string | null>(null)

  // Clear sequence key after 1 second of inactivity
  useEffect(() => {
    if (!sequenceKey) return

    const timeout = setTimeout(() => {
      setSequenceKey(null)
    }, 1000)

    return () => clearTimeout(timeout)
  }, [sequenceKey])

  // Command palette (Ctrl/Cmd + K)
  useHotkeys(
    'ctrl+k, meta+k',
    (e) => {
      e.preventDefault()
      toast.info('Командная палитра (в разработке)')
    },
    { enabled, enableOnFormTags: false }
  )

  // Help overlay (Shift + ?)
  useHotkeys(
    'shift+/',
    (e) => {
      e.preventDefault()
      if (onHelpOpen) {
        onHelpOpen()
      }
    },
    { enabled, enableOnFormTags: false }
  )

  // Focus search (/)
  useHotkeys(
    '/',
    (e) => {
      // Only trigger if not already in an input
      if (e.target instanceof HTMLElement) {
        const tagName = e.target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') return
      }

      e.preventDefault()
      const searchInput = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Поиск"], input[placeholder*="Search"]')
      if (searchInput) {
        searchInput.focus()
      } else {
        toast.info('Поиск недоступен на этой странице')
      }
    },
    { enabled }
  )

  // Escape to close modals
  useHotkeys(
    'escape',
    () => {
      // Radix UI dialogs handle this automatically, but we can add custom logic if needed
      // Currently just letting the natural behavior work
    },
    { enabled }
  )

  // "G" key - initiate navigation sequence
  useHotkeys(
    'g',
    (e) => {
      // Don't trigger if in an input field
      if (e.target instanceof HTMLElement) {
        const tagName = e.target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') return
      }

      e.preventDefault()
      setSequenceKey('g')
    },
    { enabled }
  )

  // Navigation shortcuts (triggered after "G")
  // G+D - Dashboard
  useHotkeys(
    'd',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.DASHBOARD)
      toast.success('Переход: Панель управления')
    },
    { enabled },
    [sequenceKey]
  )

  // G+N - News
  useHotkeys(
    'n',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.NEWS)
      toast.success('Переход: Новости')
    },
    { enabled },
    [sequenceKey]
  )

  // G+L - Library
  useHotkeys(
    'l',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.LIBRARY)
      toast.success('Переход: Библиотека')
    },
    { enabled },
    [sequenceKey]
  )

  // G+P - Profile
  useHotkeys(
    'p',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.PROFILE)
      toast.success('Переход: Профиль')
    },
    { enabled },
    [sequenceKey]
  )

  // G+F - Forum
  useHotkeys(
    'f',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.FORUM)
      toast.success('Переход: Форум')
    },
    { enabled },
    [sequenceKey]
  )

  // G+B - Bookmarks
  useHotkeys(
    'b',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.BOOKMARKS)
      toast.success('Переход: Закладки')
    },
    { enabled },
    [sequenceKey]
  )

  return {
    sequenceKey,
  }
}

/**
 * Admin-specific keyboard shortcuts
 */
export function useAdminKeyboardShortcuts(options: KeyboardShortcutsOptions = {}) {
  const { enabled = true, onHelpOpen } = options
  const navigate = useNavigate()
  const [sequenceKey, setSequenceKey] = useState<string | null>(null)

  // Clear sequence key after 1 second
  useEffect(() => {
    if (!sequenceKey) return

    const timeout = setTimeout(() => {
      setSequenceKey(null)
    }, 1000)

    return () => clearTimeout(timeout)
  }, [sequenceKey])

  // Command palette
  useHotkeys(
    'ctrl+k, meta+k',
    (e) => {
      e.preventDefault()
      toast.info('Командная палитра (в разработке)')
    },
    { enabled, enableOnFormTags: false }
  )

  // Help overlay
  useHotkeys(
    'shift+/',
    (e) => {
      e.preventDefault()
      if (onHelpOpen) {
        onHelpOpen()
      }
    },
    { enabled, enableOnFormTags: false }
  )

  // Focus search
  useHotkeys(
    '/',
    (e) => {
      if (e.target instanceof HTMLElement) {
        const tagName = e.target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') return
      }

      e.preventDefault()
      const searchInput = document.querySelector<HTMLInputElement>('input[type="search"], input[placeholder*="Поиск"], input[placeholder*="Search"]')
      if (searchInput) {
        searchInput.focus()
      } else {
        toast.info('Поиск недоступен на этой странице')
      }
    },
    { enabled }
  )

  // "G" key - initiate navigation sequence
  useHotkeys(
    'g',
    (e) => {
      if (e.target instanceof HTMLElement) {
        const tagName = e.target.tagName.toLowerCase()
        if (tagName === 'input' || tagName === 'textarea') return
      }

      e.preventDefault()
      setSequenceKey('g')
    },
    { enabled }
  )

  // G+D - Admin Dashboard
  useHotkeys(
    'd',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.ADMIN_DASHBOARD)
      toast.success('Переход: Обзор')
    },
    { enabled },
    [sequenceKey]
  )

  // G+R - Registrations
  useHotkeys(
    'r',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.ADMIN_REGISTRATIONS)
      toast.success('Переход: Заявки')
    },
    { enabled },
    [sequenceKey]
  )

  // G+U - Users
  useHotkeys(
    'u',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.ADMIN_USERS)
      toast.success('Переход: Пользователи')
    },
    { enabled },
    [sequenceKey]
  )

  // G+A - Analytics
  useHotkeys(
    'a',
    (e) => {
      if (sequenceKey !== 'g') return

      e.preventDefault()
      setSequenceKey(null)
      navigate(ROUTES.ADMIN_ANALYTICS)
      toast.success('Переход: Аналитика')
    },
    { enabled },
    [sequenceKey]
  )

  return {
    sequenceKey,
  }
}
