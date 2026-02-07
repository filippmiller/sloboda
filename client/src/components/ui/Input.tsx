import { forwardRef, useState, type InputHTMLAttributes, type ReactNode } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: ReactNode
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', id, onFocus, onBlur, ...props }, ref) => {
    const inputId = id || label?.toLowerCase().replace(/\s+/g, '-')
    const [focused, setFocused] = useState(false)

    return (
      <div className={`flex flex-col gap-1.5 ${error ? 'animate-shake' : ''}`}>
        {label && (
          <label
            htmlFor={inputId}
            className={`
              text-sm font-medium transition-colors duration-200
              ${focused ? 'text-accent' : 'text-text-secondary'}
            `}
          >
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`
              w-full px-3 py-2 rounded-lg
              bg-bg-card border border-border
              text-text placeholder:text-text-muted
              focus:outline-none focus:border-accent
              focus:shadow-[0_0_0_3px_var(--color-accent-glow)]
              transition-all duration-200
              ${icon ? 'pl-9' : ''}
              ${error ? 'border-red-500 focus:border-red-500 focus:shadow-[0_0_0_3px_rgba(239,68,68,0.15)]' : ''}
              ${className}
            `}
            onFocus={(e) => {
              setFocused(true)
              onFocus?.(e)
            }}
            onBlur={(e) => {
              setFocused(false)
              onBlur?.(e)
            }}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-red-400">{error}</p>
        )}
      </div>
    )
  },
)

Input.displayName = 'Input'

export default Input
