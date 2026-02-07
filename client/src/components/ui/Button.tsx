import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  loading?: boolean
  children: ReactNode
}

const variantClasses: Record<string, string> = {
  primary: [
    'bg-gradient-to-b from-accent to-[#a82e12] text-white',
    'shadow-[0_1px_2px_rgba(0,0,0,0.3),inset_0_1px_0_rgba(255,255,255,0.1)]',
    'hover:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_var(--color-accent-glow)]',
    'hover:brightness-110',
    'active:brightness-95 active:shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
  ].join(' '),
  secondary: [
    'bg-bg-card text-text border border-border',
    'shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
    'hover:border-border-hover hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)]',
    'hover:bg-bg-elevated',
    'active:shadow-[0_1px_2px_rgba(0,0,0,0.2)]',
  ].join(' '),
  ghost: [
    'bg-transparent text-text-secondary',
    'hover:text-text hover:bg-bg-card',
    'active:bg-bg-elevated',
  ].join(' '),
  danger: [
    'bg-gradient-to-b from-red-900/40 to-red-900/30 text-red-400 border border-red-900/50',
    'shadow-[0_1px_2px_rgba(0,0,0,0.3)]',
    'hover:border-red-800/60 hover:shadow-[0_4px_16px_rgba(0,0,0,0.3),0_0_20px_rgba(239,68,68,0.1)]',
    'hover:brightness-110',
    'active:brightness-95',
  ].join(' '),
}

const sizeClasses: Record<string, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-6 py-3 text-base',
}

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  children,
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`
        inline-flex items-center justify-center gap-2 rounded-lg
        font-medium
        transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]
        hover:translate-y-[-1px]
        active:translate-y-0
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50 focus-visible:ring-offset-2 focus-visible:ring-offset-bg
        disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 disabled:hover:shadow-none
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${loading ? 'pointer-events-none' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span
          className="inline-block h-4 w-16 rounded bg-gradient-to-r from-transparent via-white/20 to-transparent bg-[length:200%_100%] animate-shimmer"
          aria-label="Loading"
        />
      ) : (
        children
      )}
    </button>
  )
}
