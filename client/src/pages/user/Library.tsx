import { useState, useEffect, useCallback, useRef } from 'react'
import { format } from 'date-fns'
import { ru } from 'date-fns/locale'
import { Search, BookOpen, X, Clock, Bookmark, BookmarkCheck } from 'lucide-react'
import api from '@/services/api'
import type { Post, KnowledgeSubmission, Category } from '@/types'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
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
      <h1 className="text-2xl font-bold font-display">Библиотека</h1>

      {/* Search */}
      <div className="relative">
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
            focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
            transition-colors duration-150 text-sm
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
      </div>

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => handleCategoryClick(null)}
            className={`
              px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
              ${
                selectedCategory === null
                  ? 'bg-accent text-white'
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
                px-3 py-1.5 rounded-lg text-xs font-medium transition-colors
                ${
                  selectedCategory === String(cat.id)
                    ? 'bg-accent text-white'
                    : 'bg-bg-card border border-border text-text-secondary hover:text-text hover:border-border-hover'
                }
              `}
            >
              {cat.name}
            </button>
          ))}
        </div>
      )}

      {/* Tags */}
      {allTags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setSelectedTag(null)}
            className={`
              px-2.5 py-1 rounded-md text-xs font-medium transition-colors
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
                px-2.5 py-1 rounded-md text-xs font-medium transition-colors
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
            <Card key={i}>
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-bg-elevated rounded w-1/4" />
                <div className="h-5 bg-bg-elevated rounded w-3/4" />
                <div className="h-4 bg-bg-elevated rounded w-full" />
              </div>
            </Card>
          ))}
        </div>
      ) : filteredItems.length > 0 ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredItems.map((item) => (
              <Card
                key={`${item._type}-${item.id}`}
                className="hover:border-border-hover transition-colors cursor-pointer"
                onClick={() =>
                  setExpandedId(expandedId === item.id ? null : item.id)
                }
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {getItemCategoryName(item) && (
                        <span className="px-2 py-0.5 rounded bg-bg-elevated text-text-secondary text-xs">
                          {getItemCategoryName(item)}
                        </span>
                      )}
                      <span
                        className={`
                          px-2 py-0.5 rounded text-xs
                          ${
                            item._type === 'article'
                              ? 'bg-green/10 text-green'
                              : 'bg-accent/10 text-accent'
                          }
                        `}
                      >
                        {item._type === 'article' ? 'Статья' : 'Знания'}
                      </span>
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
                          className="px-1.5 py-0.5 rounded bg-bg-elevated text-text-muted text-[10px]"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}

                  {expandedId === item.id && getItemBody(item) && (
                    <div
                      className="text-sm text-text-secondary pt-2 border-t border-border prose prose-invert prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(getItemBody(item)!) }}
                    />
                  )}

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
