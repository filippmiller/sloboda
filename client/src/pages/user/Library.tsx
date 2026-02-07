import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { motion, AnimatePresence } from 'motion/react'
import { Search, BookOpen, X, Clock, Bookmark, BookmarkCheck } from 'lucide-react'
import api from '@/services/api'
import type { Post, KnowledgeSubmission, Category } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { SkeletonCard } from '@/components/ui/Skeleton'
import { estimateReadingTime, formatReadingTime } from '@/utils/readingTime'
import { sanitizeHtml } from '@/utils/sanitize'

interface ArticleItem extends Post {
  _type: 'article'
}

interface KnowledgeItem extends KnowledgeSubmission {
  _type: 'knowledge'
}

type ContentItem = ArticleItem | KnowledgeItem

const PAGE_SIZE = 10

const staggerItem = {
  hidden: { opacity: 0, y: 16 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.3, ease: [0.4, 0, 0.2, 1] as const },
  }),
}

export default function Library() {
  const [items, setItems] = useState<ContentItem[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(new Set())
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Debounce search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search)
    }, 400)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [search])

  // Fetch categories
  useEffect(() => {
    async function fetchCategories() {
      try {
        const response = await api.get('/user/categories')
        setCategories(response.data.data ?? response.data ?? [])
      } catch {
        // Non-critical
      }
    }
    fetchCategories()
  }, [])

  // Fetch bookmark IDs
  useEffect(() => {
    async function fetchBookmarkIds() {
      try {
        const res = await api.get('/user/bookmarks/ids')
        setBookmarkedIds(new Set(res.data.data ?? []))
      } catch {
        // Non-critical
      }
    }
    fetchBookmarkIds()
  }, [])

  const handleToggleBookmark = async (e: React.MouseEvent, postId: number) => {
    e.stopPropagation()
    try {
      const res = await api.post('/user/bookmarks/toggle', { postId })
      setBookmarkedIds((prev) => {
        const next = new Set(prev)
        if (res.data.data?.bookmarked) {
          next.add(postId)
        } else {
          next.delete(postId)
        }
        return next
      })
    } catch {
      // Non-critical
    }
  }

  // Fetch content
  const fetchContent = useCallback(
    async (currentOffset: number, append: boolean) => {
      const setter = append ? setLoadingMore : setLoading
      setter(true)
      try {
        const params: Record<string, unknown> = { limit: PAGE_SIZE, offset: currentOffset }
        if (selectedCategory) params.category_id = selectedCategory
        if (debouncedSearch) params.search = debouncedSearch

        const [articlesRes, knowledgeRes] = await Promise.allSettled([
          api.get('/user/articles', { params }),
          api.get('/user/knowledge', { params }),
        ])

        const articles: ContentItem[] =
          articlesRes.status === 'fulfilled'
            ? (articlesRes.value.data.data ?? []).map((a: Post) => ({
                ...a,
                _type: 'article' as const,
              }))
            : []

        const knowledge: ContentItem[] =
          knowledgeRes.status === 'fulfilled'
            ? (knowledgeRes.value.data.data ?? []).map((k: KnowledgeSubmission) => ({
                ...k,
                _type: 'knowledge' as const,
              }))
            : []

        const combined = [...articles, ...knowledge].sort(
          (a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        )

        const articlesTotal =
          articlesRes.status === 'fulfilled' ? (articlesRes.value.data.total ?? 0) : 0
        const knowledgeTotal =
          knowledgeRes.status === 'fulfilled' ? (knowledgeRes.value.data.total ?? 0) : 0

        if (append) {
          setItems((prev) => [...prev, ...combined])
        } else {
          setItems(combined)
        }
        setTotal(articlesTotal + knowledgeTotal)
      } catch {
        // Non-critical
      } finally {
        setter(false)
      }
    },
    [selectedCategory, debouncedSearch],
  )

  useEffect(() => {
    setOffset(0)
    fetchContent(0, false)
  }, [fetchContent])

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE
    setOffset(nextOffset)
    fetchContent(nextOffset, true)
  }

  const hasMore = items.length < total

  const handleCategoryClick = (catId: string | null) => {
    setSelectedCategory(catId)
    setOffset(0)
  }

  const getItemTitle = (item: ContentItem) => item.title

  const getItemSummary = (item: ContentItem) => {
    if (item._type === 'article') return item.summary
    return item.description
  }

  const getItemCategoryName = (item: ContentItem) => {
    if (item._type === 'article') return item.category_name
    return item.ai_category_name
  }

  const getItemBody = (item: ContentItem) => {
    return item.body
  }

  const getItemTags = (item: ContentItem): string[] => {
    if (item._type === 'article') return item.tags ?? []
    return item.ai_tags ?? []
  }

  // Collect unique tags across all items
  const allTags = Array.from(
    new Set(items.flatMap(getItemTags).filter(Boolean)),
  ).sort()

  // Filter items by selected tag (client-side)
  const filteredItems = selectedTag
    ? items.filter((item) => getItemTags(item).includes(selectedTag))
    : items

  return (
    <div className="space-y-6">
      <motion.h1
        className="text-2xl font-bold font-display"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        Библиотека
      </motion.h1>

      {/* Search */}
      <motion.div
        className="relative"
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, delay: 0.05 }}
      >
        <Search
          className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
          size={16}
        />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по библиотеке..."
          className="
            w-full pl-9 pr-9 py-2.5 rounded-lg
            bg-bg-card border border-border
            text-text placeholder:text-text-muted
            focus:outline-none focus:border-accent
            focus:shadow-[0_0_0_3px_var(--color-accent-glow)]
            transition-all duration-200 text-sm
          "
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </motion.div>

      {/* Categories */}
      {categories.length > 0 && (
        <motion.div
          className="flex flex-wrap gap-2 relative"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <button
            type="button"
            onClick={() => handleCategoryClick(null)}
            className={`
              relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
              ${
                selectedCategory === null
                  ? 'bg-accent text-white shadow-[0_0_12px_var(--color-accent-glow)]'
                  : 'bg-bg-card border border-border text-text-secondary hover:text-text hover:border-border-hover'
              }
            `}
          >
            Все
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              type="button"
              onClick={() => handleCategoryClick(String(cat.id))}
              className={`
                relative px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
                ${
                  selectedCategory === String(cat.id)
                    ? 'bg-accent text-white shadow-[0_0_12px_var(--color-accent-glow)]'
                    : 'bg-bg-card border border-border text-text-secondary hover:text-text hover:border-border-hover'
                }
              `}
            >
              {cat.name}
            </button>
          ))}
        </motion.div>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`
              px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200
              ${
                selectedTag === null
                  ? 'bg-accent/20 text-accent border border-accent/30'
                  : 'bg-bg-card border border-border text-text-muted hover:text-text hover:border-border-hover'
              }
            `}
          >
            Все теги
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
              className={`
                px-2.5 py-1 rounded-md text-xs font-medium transition-all duration-200
                ${
                  selectedTag === tag
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-bg-card border border-border text-text-muted hover:text-text hover:border-border-hover'
                }
              `}
            >
              {tag}
            </button>
          ))}
        </div>
      )}

      {/* Content grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filteredItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item, i) => (
              <motion.div
                key={`${item._type}-${item.id}`}
                custom={i}
                variants={staggerItem}
                initial="hidden"
                animate="visible"
              >
                <Card
                  variant="interactive"
                  onClick={() =>
                    setExpandedId(expandedId === item.id ? null : item.id)
                  }
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {getItemCategoryName(item) && (
                          <Badge>{getItemCategoryName(item)}</Badge>
                        )}
                        <Badge variant={item._type === 'article' ? 'success' : 'danger'}>
                          {item._type === 'article' ? 'Статья' : 'Знания'}
                        </Badge>
                      </div>
                      {item._type === 'article' && (
                        <button
                          onClick={(e) => handleToggleBookmark(e, item.id)}
                          className="flex-shrink-0 p-1 rounded text-text-muted hover:text-accent transition-colors"
                          title={bookmarkedIds.has(item.id) ? 'Убрать из закладок' : 'В закладки'}
                        >
                          {bookmarkedIds.has(item.id) ? (
                            <BookmarkCheck size={16} className="text-accent" />
                          ) : (
                            <Bookmark size={16} />
                          )}
                        </button>
                      )}
                    </div>

                    <h3 className="font-medium text-text leading-snug">
                      {getItemTitle(item)}
                    </h3>

                    {getItemSummary(item) && (
                      <p className="text-sm text-text-secondary line-clamp-2">
                        {getItemSummary(item)}
                      </p>
                    )}

                    {getItemTags(item).length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {getItemTags(item).map((tag) => (
                          <span
                            key={tag}
                            className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted text-[10px] transition-colors hover:text-text-secondary"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <AnimatePresence>
                      {expandedId === item.id && getItemBody(item) && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                          className="overflow-hidden"
                        >
                          <div
                            className="text-sm text-text-secondary pt-2 border-t border-border prose prose-invert prose-sm max-w-none"
                            dangerouslySetInnerHTML={{ __html: sanitizeHtml(getItemBody(item)!) }}
                          />
                        </motion.div>
                      )}
                    </AnimatePresence>

                    <div className="flex items-center gap-3 text-xs text-text-muted pt-1">
                      <time>
                        {format(new Date(item.created_at), 'd MMM yyyy', {
                          locale: ru,
                        })}
                      </time>
                      <span className="flex items-center gap-1">
                        <Clock size={12} />
                        {formatReadingTime(estimateReadingTime(getItemBody(item)))}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>

          {hasMore && !selectedTag && (
            <div className="text-center pt-2">
              <Button
                variant="secondary"
                onClick={handleLoadMore}
                loading={loadingMore}
              >
                Загрузить ещё
              </Button>
            </div>
          )}
        </>
      ) : (
        <Card>
          <div className="text-center py-12 space-y-3">
            <BookOpen className="text-text-muted mx-auto" size={40} />
            <p className="text-text-secondary text-sm">
              {debouncedSearch || selectedCategory
                ? 'Ничего не найдено. Попробуйте изменить параметры поиска.'
                : 'Библиотека пока пуста'}
            </p>
          </div>
        </Card>
      )}
    </div>
  )
}
