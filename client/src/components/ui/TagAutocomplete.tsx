import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import api from '@/services/api'

interface Tag {
  tag: string
  count: number
}

interface TagAutocompleteProps {
  value: string[]
  onChange: (tags: string[]) => void
  placeholder?: string
}

export default function TagAutocomplete({ value, onChange, placeholder }: TagAutocompleteProps) {
  const [input, setInput] = useState('')
  const [suggestions, setSuggestions] = useState<Tag[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [popularTags, setPopularTags] = useState<Tag[]>([])
  const inputRef = useRef<HTMLInputElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // Load popular tags on mount
  useEffect(() => {
    api.get('/tags/popular', { params: { limit: 30 } })
      .then(res => setPopularTags(res.data.data ?? []))
      .catch(() => {})
  }, [])

  // Search tags as user types
  useEffect(() => {
    if (input.length < 2) {
      setSuggestions(popularTags)
      return
    }

    const timer = setTimeout(() => {
      api.get('/tags/search', { params: { q: input } })
        .then(res => setSuggestions(res.data.data ?? []))
        .catch(() => setSuggestions([]))
    }, 300)

    return () => clearTimeout(timer)
  }, [input, popularTags])

  // Handle click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowSuggestions(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const addTag = (tag: string) => {
    const normalized = tag.toLowerCase().trim()
    if (normalized && !value.includes(normalized)) {
      onChange([...value, normalized])
    }
    setInput('')
    setShowSuggestions(false)
    inputRef.current?.focus()
  }

  const removeTag = (tagToRemove: string) => {
    onChange(value.filter(t => t !== tagToRemove))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (input.trim()) {
        addTag(input)
      }
    } else if (e.key === 'Backspace' && !input && value.length > 0) {
      removeTag(value[value.length - 1])
    }
  }

  const filteredSuggestions = suggestions.filter(
    s => !value.includes(s.tag.toLowerCase())
  )

  return (
    <div ref={wrapperRef} className="relative">
      {/* Selected tags + input */}
      <div
        className="flex flex-wrap gap-1.5 p-2 rounded-lg bg-bg-card border border-border
          focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/30
          min-h-[42px] cursor-text"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-accent/20
              text-accent text-xs font-medium border border-accent/30"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                removeTag(tag)
              }}
              className="hover:text-accent-hover transition-colors"
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onFocus={() => setShowSuggestions(true)}
          onKeyDown={handleKeyDown}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] bg-transparent border-none outline-none
            text-text text-sm placeholder:text-text-muted"
        />
      </div>

      {/* Suggestions dropdown */}
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div
          className="absolute z-50 mt-1 w-full max-h-[240px] overflow-y-auto
            bg-bg-card border border-border rounded-lg shadow-lg"
        >
          {filteredSuggestions.map((suggestion) => (
            <button
              key={suggestion.tag}
              type="button"
              onClick={() => addTag(suggestion.tag)}
              className="w-full px-3 py-2 text-left text-sm hover:bg-bg-elevated
                transition-colors flex items-center justify-between group"
            >
              <span className="text-text group-hover:text-accent transition-colors">
                {suggestion.tag}
              </span>
              <span className="text-xs text-text-muted">
                {suggestion.count}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
