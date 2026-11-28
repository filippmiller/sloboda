import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import { Plus } from 'lucide-react'
import api from '@/services/api'

interface Tag {
  tag: string
  count: number
}

interface RelatedTagsProps {
  currentTag: string
  selectedTags: string[]
  onTagAdd: (tag: string) => void
}

export default function RelatedTags({ currentTag, selectedTags, onTagAdd }: RelatedTagsProps) {
  const [fetchState, setFetchState] = useState<{ key: string; tags: Tag[] }>({ key: '', tags: [] })
  const requestKey = currentTag ? `${currentTag}::${selectedTags.join(',')}` : ''

  useEffect(() => {
    if (!currentTag) return

    let cancelled = false
    const key = `${currentTag}::${selectedTags.join(',')}`

    api.get('/tags/related', { params: { tag: currentTag, limit: 8 } })
      .then(res => {
        if (cancelled) return
        const tags = (res.data.data ?? []).filter((t: Tag) => !selectedTags.includes(t.tag))
        setFetchState({ key, tags })
      })
      .catch(() => {
        if (cancelled) return
        setFetchState({ key, tags: [] })
      })

    return () => {
      cancelled = true
    }
  }, [currentTag, selectedTags])

  const loading = Boolean(currentTag) && fetchState.key !== requestKey
  const relatedTags = currentTag && fetchState.key === requestKey ? fetchState.tags : []

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-text-muted">
        <span>Loading related tags...</span>
      </div>
    )
  }

  if (relatedTags.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2"
    >
      <span className="text-xs font-medium text-text-secondary">Related:</span>
      {relatedTags.map((tag) => (
        <button
          key={tag.tag}
          type="button"
          onClick={() => onTagAdd(tag.tag)}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-bg-elevated
            border border-border text-text-muted hover:text-text hover:border-border-hover
            text-xs transition-colors group"
        >
          <Plus size={10} className="opacity-60 group-hover:opacity-100" />
          {tag.tag}
          <span className="text-[10px] opacity-60">({tag.count})</span>
        </button>
      ))}
    </motion.div>
  )
}
