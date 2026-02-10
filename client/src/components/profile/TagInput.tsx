import { useState, useRef, type KeyboardEvent } from 'react'
import { X } from 'lucide-react'

interface TagInputProps {
  label?: string
  placeholder?: string
  value: string[]
  onChange: (tags: string[]) => void
  error?: string
  maxTags?: number
}

export default function TagInput({
  label,
  placeholder,
  value,
  onChange,
  error,
  maxTags = 20,
}: TagInputProps) {
  const [input, setInput] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const addTag = (tag: string) => {
    const trimmed = tag.trim()
    if (!trimmed) return
    if (value.includes(trimmed)) return
    if (value.length >= maxTags) return
    onChange([...value, trimmed])
    setInput('')
  }

  const removeTag = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      addTag(input)
    }
    if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value.length - 1)
    }
  }

  return (
    <div className={`flex flex-col gap-1.5 ${error ? 'animate-shake' : ''}`}>
      {label && (
        <label className="text-sm font-medium text-text-secondary">{label}</label>
      )}
      <div
        className={`
          flex flex-wrap gap-1.5 p-2 rounded-lg
          bg-bg-card border border-border
          focus-within:border-accent
          focus-within:shadow-[0_0_0_3px_var(--color-accent-glow)]
          transition-all duration-200 cursor-text min-h-[42px]
          ${error ? 'border-red-500' : ''}
        `}
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={`${tag}-${i}`}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent/10 text-accent text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(i)
              }}
              className="hover:text-accent-hover transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => addTag(input)}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent outline-none text-text placeholder:text-text-muted text-sm py-0.5"
        />
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  )
}
