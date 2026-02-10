import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { Globe } from 'lucide-react'
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from '@/i18n'

interface LanguageSwitcherProps {
  /** 'compact' shows just the globe icon + code, 'full' shows flag + label */
  variant?: 'compact' | 'full'
}

export default function LanguageSwitcher({ variant = 'compact' }: LanguageSwitcherProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const current = SUPPORTED_LANGUAGES.find((l) => l.code === i18n.language)
    ?? SUPPORTED_LANGUAGES[0]

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    if (open) document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const handleChange = (code: SupportedLanguage) => {
    i18n.changeLanguage(code)
    localStorage.setItem('sloboda_language', code)
    setOpen(false)
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-text-secondary hover:text-text hover:bg-bg-elevated transition-colors w-full"
      >
        <Globe size={16} />
        {variant === 'full' ? (
          <span>{current.flag} {current.label}</span>
        ) : (
          <span className="uppercase text-xs font-medium">{current.code}</span>
        )}
      </button>

      {open && (
        <div className="absolute bottom-full left-0 mb-1 w-44 bg-bg-card border border-border rounded-lg shadow-xl py-1 z-50">
          {SUPPORTED_LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              onClick={() => handleChange(lang.code)}
              className={`
                flex items-center gap-2 w-full px-3 py-2 text-sm transition-colors
                ${lang.code === current.code
                  ? 'text-accent bg-accent/5'
                  : 'text-text-secondary hover:text-text hover:bg-bg-elevated'
                }
              `}
            >
              <span>{lang.flag}</span>
              <span>{lang.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
