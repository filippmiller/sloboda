import { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { motion, AnimatePresence } from 'motion/react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { X, BookOpen, Loader2, Layers, ExternalLink } from 'lucide-react'
import adminApi from '@/services/adminApi'

interface KnowledgeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  domainCode: string | null
  domainName: string
  sectionKey: string | null
  sectionTitle: string
}

interface SectionData {
  content: string
  hasEnrichedContent: boolean
  sectionTitle: string
}

export default function KnowledgeModal({
  open,
  onOpenChange,
  domainCode,
  domainName,
  sectionKey,
  sectionTitle,
}: KnowledgeModalProps) {
  const [data, setData] = useState<SectionData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !domainCode || !sectionKey) {
      setData(null)
      setError(null)
      return
    }

    const fetchSection = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await adminApi.get(`/admin/domains/${domainCode}/sections/${sectionKey}`)
        setData(res.data.data)
      } catch {
        setError('Не удалось загрузить раздел')
      } finally {
        setLoading(false)
      }
    }
    fetchSection()
  }, [open, domainCode, sectionKey])

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <Dialog.Portal forceMount>
            <Dialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 bg-black/70 backdrop-blur-md z-50"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              />
            </Dialog.Overlay>
            <Dialog.Content asChild>
              <motion.div
                className="
                  fixed top-[5vh] left-[10%] right-[10%]
                  h-[90vh] overflow-hidden
                  bg-bg-card border border-border rounded-xl
                  shadow-[0_8px_32px_rgba(0,0,0,0.6),0_0_24px_var(--color-accent-soft)]
                  z-50 focus:outline-none
                  flex flex-col
                "
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 20 }}
                transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              >
                {/* Header */}
                <div className="flex items-start justify-between px-8 py-5 border-b border-border bg-bg-card/80 backdrop-blur-lg flex-shrink-0">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="p-2 rounded-lg bg-accent/10 flex-shrink-0 mt-0.5">
                      <BookOpen size={18} className="text-accent" />
                    </div>
                    <div className="min-w-0">
                      <Dialog.Title className="text-lg font-semibold font-display text-text leading-tight">
                        {sectionTitle || data?.sectionTitle || 'Загрузка...'}
                      </Dialog.Title>
                      <Dialog.Description className="text-sm text-text-muted mt-1 flex items-center gap-2">
                        <Layers size={12} />
                        {domainName}
                        {data?.hasEnrichedContent && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium bg-green-500/10 text-green-400 rounded border border-green-500/20">
                            Исследовано
                          </span>
                        )}
                      </Dialog.Description>
                    </div>
                  </div>
                  <Dialog.Close className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-bg-elevated transition-colors flex-shrink-0">
                    <X size={20} />
                  </Dialog.Close>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-8 py-6">
                  {loading && (
                    <div className="flex items-center justify-center py-20">
                      <Loader2 size={28} className="animate-spin text-accent" />
                    </div>
                  )}

                  {error && (
                    <div className="text-center py-20 text-red-400 text-sm">
                      {error}
                    </div>
                  )}

                  {data && !loading && (
                    <div className="knowledge-content max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          h1: ({ children }) => (
                            <h1 className="text-2xl font-bold font-display text-text mt-6 mb-3 first:mt-0">{children}</h1>
                          ),
                          h2: ({ children }) => (
                            <h2 className="text-xl font-bold font-display text-text mt-6 mb-3 border-b border-border pb-2">{children}</h2>
                          ),
                          h3: ({ children }) => (
                            <h3 className="text-lg font-semibold text-text mt-5 mb-2">{children}</h3>
                          ),
                          h4: ({ children }) => (
                            <h4 className="text-base font-semibold text-text mt-4 mb-2">{children}</h4>
                          ),
                          p: ({ children }) => (
                            <p className="text-sm text-text-secondary leading-relaxed mb-3">{children}</p>
                          ),
                          ul: ({ children }) => (
                            <ul className="text-sm text-text-secondary mb-3 ml-4 space-y-1 list-disc">{children}</ul>
                          ),
                          ol: ({ children }) => (
                            <ol className="text-sm text-text-secondary mb-3 ml-4 space-y-1 list-decimal">{children}</ol>
                          ),
                          li: ({ children }) => (
                            <li className="leading-relaxed">{children}</li>
                          ),
                          strong: ({ children }) => (
                            <strong className="font-semibold text-text">{children}</strong>
                          ),
                          em: ({ children }) => (
                            <em className="italic text-text-secondary">{children}</em>
                          ),
                          blockquote: ({ children }) => (
                            <blockquote className="border-l-2 border-accent/40 pl-4 my-3 text-sm text-text-muted italic">{children}</blockquote>
                          ),
                          code: ({ children, className }) => {
                            const isInline = !className
                            if (isInline) {
                              return <code className="px-1.5 py-0.5 text-xs bg-bg-elevated text-accent rounded font-mono">{children}</code>
                            }
                            return (
                              <code className="block p-4 bg-bg rounded-lg text-xs font-mono text-text-secondary overflow-x-auto mb-3 border border-border">
                                {children}
                              </code>
                            )
                          },
                          pre: ({ children }) => (
                            <pre className="mb-3">{children}</pre>
                          ),
                          table: ({ children }) => (
                            <div className="overflow-x-auto mb-4 rounded-lg border border-border">
                              <table className="w-full text-sm">{children}</table>
                            </div>
                          ),
                          thead: ({ children }) => (
                            <thead className="bg-bg-elevated">{children}</thead>
                          ),
                          th: ({ children }) => (
                            <th className="px-3 py-2 text-left text-xs font-semibold text-text border-b border-border">{children}</th>
                          ),
                          td: ({ children }) => (
                            <td className="px-3 py-2 text-xs text-text-secondary border-b border-border/50">{children}</td>
                          ),
                          tr: ({ children }) => (
                            <tr className="hover:bg-bg-elevated/50 transition-colors">{children}</tr>
                          ),
                          hr: () => (
                            <hr className="my-6 border-border" />
                          ),
                          a: ({ href, children }) => (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:text-accent/80 underline underline-offset-2 inline-flex items-center gap-0.5"
                            >
                              {children}
                              <ExternalLink size={10} />
                            </a>
                          ),
                        }}
                      >
                        {data.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </motion.div>
            </Dialog.Content>
          </Dialog.Portal>
        )}
      </AnimatePresence>
    </Dialog.Root>
  )
}
