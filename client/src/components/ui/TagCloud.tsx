import { useEffect, useState } from 'react'
import { motion } from 'motion/react'
import api from '@/services/api'

interface Tag {
  tag: string
  count: number
}

interface TagCloudProps {
  selectedTag: string | null
  onTagClick: (tag: string) => void
  maxTags?: number
}

export default function TagCloud({ selectedTag, onTagClick, maxTags = 30 }: TagCloudProps) {
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/tags/popular', { params: { limit: maxTags } })
      .then(res => {
        setTags(res.data.data ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [maxTags])

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (tags.length === 0) return null

  // Calculate font sizes based on tag frequency
  const maxCount = Math.max(...tags.map(t => t.count))
  const minCount = Math.min(...tags.map(t => t.count))
  const range = maxCount - minCount || 1

  const getFontSize = (count: number) => {
    const normalized = (count - minCount) / range
    return 10 + normalized * 8 // 10px to 18px
  }

  const getOpacity = (count: number) => {
    const normalized = (count - minCount) / range
    return 0.5 + normalized * 0.5 // 0.5 to 1.0
  }

  return (
    <div className="flex flex-wrap gap-2 items-center justify-center">
      {tags.map((tag, i) => (
        <motion.button
          key={tag.tag}
          type="button"
          onClick={() => onTagClick(tag.tag)}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: i * 0.02, duration: 0.3 }}
          className={`
            px-2.5 py-1 rounded-md font-medium transition-all duration-200
            ${selectedTag === tag.tag
              ? 'bg-accent/20 text-accent border border-accent/30 shadow-[0_0_8px_var(--color-accent-glow)]'
              : 'bg-bg-card border border-border text-text-muted hover:text-text hover:border-border-hover hover:bg-bg-elevated'
            }
          `}
          style={{
            fontSize: `${getFontSize(tag.count)}px`,
            opacity: selectedTag === tag.tag ? 1 : getOpacity(tag.count),
          }}
        >
          {tag.tag}
          <span className="ml-1 text-[10px] opacity-60">({tag.count})</span>
        </motion.button>
      ))}
    </div>
  )
}
