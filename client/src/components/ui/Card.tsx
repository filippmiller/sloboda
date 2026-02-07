import type { HTMLAttributes, ReactNode } from 'react'

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
  padding?: 'none' | 'sm' | 'md' | 'lg'
  variant?: 'default' | 'interactive' | 'highlighted' | 'glass'
}

const paddingClasses: Record<string, string> = {
  none: '',
  sm: 'p-4',
  md: 'p-6',
  lg: 'p-8',
}

const variantClasses: Record<string, string> = {
  default: [
    'bg-bg-card border border-border rounded-xl',
    'shadow-[var(--shadow-card)]',
  ].join(' '),
  interactive: [
    'bg-bg-card border border-border rounded-xl',
    'shadow-[var(--shadow-card)]',
    'transition-all duration-200 ease-out cursor-pointer',
    'hover:translate-y-[-2px] hover:shadow-[var(--shadow-card-hover)] hover:border-border-hover',
  ].join(' '),
  highlighted: [
    'bg-bg-card border border-accent/20 rounded-xl',
    'shadow-[var(--shadow-card),0_0_20px_var(--color-accent-glow)]',
  ].join(' '),
  glass: [
    'bg-bg-card/60 backdrop-blur-lg border border-white/[0.06] rounded-xl',
    'shadow-[var(--shadow-card)]',
  ].join(' '),
}

export default function Card({
  children,
  padding = 'md',
  variant = 'default',
  className = '',
  ...props
}: CardProps) {
  return (
    <div
      className={`
        noise-overlay
        ${variantClasses[variant]}
        ${paddingClasses[padding]}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  )
}
