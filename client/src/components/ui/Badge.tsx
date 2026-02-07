import type { ReactNode } from 'react'

interface BadgeProps {
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  dot?: boolean
  pulse?: boolean
  children: ReactNode
  className?: string
}

const variantClasses: Record<string, string> = {
  default: 'bg-bg-elevated text-text-secondary',
  success: 'bg-green/10 text-green',
  warning: 'bg-amber-500/10 text-amber-400',
  danger: 'bg-red-500/10 text-red-400',
  info: 'bg-blue-500/10 text-blue-400',
}

const dotColors: Record<string, string> = {
  default: 'bg-text-muted',
  success: 'bg-green',
  warning: 'bg-amber-400',
  danger: 'bg-red-400',
  info: 'bg-blue-400',
}

export default function Badge({
  variant = 'default',
  dot = false,
  pulse = false,
  children,
  className = '',
}: BadgeProps) {
  return (
    <span
      className={`
        inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md
        text-xs font-medium
        ${variantClasses[variant]}
        ${className}
      `}
    >
      {dot && (
        <span className="relative flex h-1.5 w-1.5">
          {pulse && (
            <span
              className={`absolute inset-0 rounded-full ${dotColors[variant]} animate-glow-pulse`}
            />
          )}
          <span
            className={`relative inline-flex h-1.5 w-1.5 rounded-full ${dotColors[variant]}`}
          />
        </span>
      )}
      {children}
    </span>
  )
}
