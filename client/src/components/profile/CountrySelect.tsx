import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronDown, Search } from 'lucide-react'
import { COUNTRIES, type Country } from '@/data/countries'

interface CountrySelectProps {
  label?: string
  placeholder?: string
  value: string
  onChange: (code: string) => void
  error?: string
}

export default function CountrySelect({
  label,
  placeholder,
  value,
  onChange,
  error,
}: CountrySelectProps) {
  const { i18n } = useTranslation()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const lang = (i18n.language || 'en') as keyof Country['name']

  const getCountryName = (c: Country) => c.name[lang] || c.name.en

  const selected = COUNTRIES.find((c) => c.code === value)

  const filtered = COUNTRIES.filter((c) => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      getCountryName(c).toLowerCase().includes(s) ||
      c.code.toLowerCase().includes(s)
    )
  })

  useEffect(() => {
    if (open && searchRef.current) {
      searchRef.current.focus()
    }
  }, [open])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <div className={`flex flex-col gap-1.5 ${error ? 'animate-shake' : ''}`} ref={containerRef}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className={`
            w-full flex items-center justify-between px-3 py-2 rounded-lg
            bg-bg-card border border-border text-sm
            transition-all duration-200
            ${open ? 'border-accent shadow-[0_0_0_3px_var(--color-accent-glow)]' : ''}
            ${error ? 'border-red-500' : ''}
          `}
        >
          <span className={selected ? 'text-text' : 'text-text-muted'}>
            {selected ? `${selected.flag} ${getCountryName(selected)}` : placeholder}
          </span>
          <ChevronDown
            size={16}
            className={`text-text-muted transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-full bg-bg-card border border-border rounded-lg shadow-lg max-h-60 overflow-hidden">
            <div className="p-2 border-b border-border">
              <div className="relative">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-md bg-bg-elevated border-none text-sm text-text placeholder:text-text-muted focus:outline-none"
                />
              </div>
            </div>
            <div className="overflow-y-auto max-h-48">
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-sm text-text-muted text-center">-</div>
              ) : (
                filtered.map((country) => (
                  <button
                    key={country.code}
                    type="button"
                    onClick={() => {
                      onChange(country.code)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2 text-sm text-left
                      transition-colors duration-100
                      ${country.code === value
                        ? 'bg-accent/10 text-accent'
                        : 'text-text hover:bg-bg-elevated'
                      }
                    `}
                  >
                    <span className="text-base">{country.flag}</span>
                    <span>{getCountryName(country)}</span>
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
