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
  const [relatedTags, setRelatedTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!currentTag) {
      setRelatedTags([])
      return
    }

    setLoading(true)
    api.get('/tags/related', { params: { tag: currentTag, limit: 8 } })
      .then(res => {
        const tags = (res.data.data ?? []).filter((t: Tag) => !selectedTags.includes(t.tag))
        setRelatedTags(tags)
        setLoading(false)
      })
      .catch(() => {
        setRelatedTags([])
        setLoading(false)
      })
  }, [currentTag, selectedTags])

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
