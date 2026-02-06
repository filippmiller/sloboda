import type { ReactNode } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { X } from 'lucide-react'

interface ModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description?: string
  children: ReactNode
}

export default function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ModalProps) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content
          className="
            fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
            w-full max-w-lg max-h-[85vh] overflow-y-auto
            bg-bg-card border border-border rounded-xl p-6
            shadow-2xl z-50
            focus:outline-none
          "
        >
          <div className="flex items-start justify-between mb-4">
            <div>
              <Dialog.Title className="text-lg font-semibold font-display text-text">
                {title}
              </Dialog.Title>
              {description && (
                <Dialog.Description className="text-sm text-text-secondary mt-1">
                  {description}
                </Dialog.Description>
              )}
            </div>
            <Dialog.Close
              className="
                p-1 rounded-md text-text-muted
                hover:text-text hover:bg-bg-elevated
                transition-colors
              "
            >
              <X size={18} />
            </Dialog.Close>
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
