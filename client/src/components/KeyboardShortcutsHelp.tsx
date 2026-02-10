import Modal from '@/components/ui/Modal'
import { Keyboard } from 'lucide-react'

interface Shortcut {
  action: string
  keys: string[]
  description?: string
}

interface ShortcutGroup {
  title: string
  shortcuts: Shortcut[]
}

interface KeyboardShortcutsHelpProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode?: 'user' | 'admin'
}

export default function KeyboardShortcutsHelp({
  open,
  onOpenChange,
  mode = 'user',
}: KeyboardShortcutsHelpProps) {
  const userGroups: ShortcutGroup[] = [
    {
      title: 'Навигация',
      shortcuts: [
        { action: 'Панель управления', keys: ['G', 'D'] },
        { action: 'Новости', keys: ['G', 'N'] },
        { action: 'Библиотека', keys: ['G', 'L'] },
        { action: 'Форум', keys: ['G', 'F'] },
        { action: 'Закладки', keys: ['G', 'B'] },
        { action: 'Профиль', keys: ['G', 'P'] },
      ],
    },
    {
      title: 'Действия',
      shortcuts: [
        { action: 'Командная палитра', keys: ['Ctrl', 'K'], description: 'Cmd + K на Mac' },
        { action: 'Поиск', keys: ['/'] },
        { action: 'Справка', keys: ['Shift', '?'] },
      ],
    },
    {
      title: 'Диалоги',
      shortcuts: [
        { action: 'Закрыть модальное окно', keys: ['Esc'] },
      ],
    },
  ]

  const adminGroups: ShortcutGroup[] = [
    {
      title: 'Навигация',
      shortcuts: [
        { action: 'Обзор', keys: ['G', 'D'] },
        { action: 'Заявки', keys: ['G', 'R'] },
        { action: 'Пользователи', keys: ['G', 'U'] },
        { action: 'Аналитика', keys: ['G', 'A'] },
      ],
    },
    {
      title: 'Действия',
      shortcuts: [
        { action: 'Командная палитра', keys: ['Ctrl', 'K'], description: 'Cmd + K на Mac' },
        { action: 'Поиск', keys: ['/'] },
        { action: 'Справка', keys: ['Shift', '?'] },
      ],
    },
    {
      title: 'Диалоги',
      shortcuts: [
        { action: 'Закрыть модальное окно', keys: ['Esc'] },
      ],
    },
  ]

  const groups = mode === 'admin' ? adminGroups : userGroups

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Горячие клавиши"
      description="Используйте клавиатуру для быстрой навигации"
    >
      <div className="space-y-6">
        {groups.map((group) => (
          <div key={group.title}>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-3">
              {group.title}
            </h3>
            <div className="space-y-2">
              {group.shortcuts.map((shortcut, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between py-2 px-3 rounded-lg bg-bg-elevated/50 hover:bg-bg-elevated transition-colors"
                >
                  <div>
                    <p className="text-sm font-medium text-text">{shortcut.action}</p>
                    {shortcut.description && (
                      <p className="text-xs text-text-muted mt-0.5">{shortcut.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {shortcut.keys.map((key, keyIndex) => (
                      <span key={keyIndex} className="flex items-center gap-1">
                        <kbd className="px-2 py-1 text-xs font-mono font-semibold text-text bg-bg border border-border rounded shadow-sm">
                          {key}
                        </kbd>
                        {keyIndex < shortcut.keys.length - 1 && (
                          <span className="text-text-muted text-xs">→</span>
                        )}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Footer tip */}
        <div className="pt-4 border-t border-border">
          <div className="flex items-start gap-3 p-3 rounded-lg bg-accent/5 border border-accent/10">
            <Keyboard size={18} className="text-accent mt-0.5 flex-shrink-0" />
            <div className="text-xs text-text-secondary">
              <p className="font-medium text-text mb-1">Совет</p>
              <p>
                Для навигации сначала нажмите <kbd className="px-1 py-0.5 text-[10px] font-mono bg-bg border border-border rounded">G</kbd>,
                затем вторую клавишу. Например, <kbd className="px-1 py-0.5 text-[10px] font-mono bg-bg border border-border rounded">G</kbd> → <kbd className="px-1 py-0.5 text-[10px] font-mono bg-bg border border-border rounded">D</kbd> откроет панель управления.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  )
}
