import { useState, useRef, useEffect, useCallback } from 'react'
import { Sparkles, Send, BookOpen, AlertCircle } from 'lucide-react'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'

interface Source {
  id: number
  title: string
  source: 'post' | 'knowledge'
  type: string
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  sources?: Source[]
}

const WELCOME_SUGGESTIONS = [
  'Как начать вести хозяйство на земле?',
  'Какие есть программы поддержки для переезда в село?',
  'Что нужно знать перед покупкой дома в деревне?',
]

export default function Librarian() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, scrollToBottom])

  // Auto-resize textarea
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
  }

  const sendMessage = async (questionOverride?: string) => {
    const question = (questionOverride || input).trim()
    if (!question || isStreaming) return

    setError(null)
    setInput('')
    if (inputRef.current) {
      inputRef.current.style.height = 'auto'
    }

    // Add user message
    const userMessage: ChatMessage = { role: 'user', content: question }
    const updatedMessages = [...messages, userMessage]
    setMessages(updatedMessages)

    // Prepare history (last 10 messages, excluding the current one)
    const history = updatedMessages
      .slice(-10)
      .map(({ role, content }) => ({ role, content }))

    setIsStreaming(true)

    // Add placeholder assistant message
    const assistantIndex = updatedMessages.length
    setMessages(prev => [...prev, { role: 'assistant', content: '', sources: [] }])

    try {
      const controller = new AbortController()
      abortRef.current = controller

      const response = await fetch('/api/user/librarian/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question, history }),
        signal: controller.signal,
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => null)
        throw new Error(errData?.error || `Ошибка сервера (${response.status})`)
      }

      const reader = response.body?.getReader()
      if (!reader) throw new Error('Streaming не поддерживается')

      const decoder = new TextDecoder()
      let buffer = ''
      let accumulated = ''
      let sources: Source[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })

        // Process complete SSE lines
        const lines = buffer.split('\n')
        buffer = lines.pop() || '' // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('event: sources')) {
            // Next data line contains sources
            continue
          }

          if (line.startsWith('event: error')) {
            // Next data line contains error
            continue
          }

          if (line.startsWith('data: ')) {
            const data = line.slice(6)

            if (data === '[DONE]') {
              continue
            }

            try {
              const parsed = JSON.parse(data)

              // Check if this is sources data (array)
              if (Array.isArray(parsed)) {
                sources = parsed
                setMessages(prev => {
                  const updated = [...prev]
                  if (updated[assistantIndex]) {
                    updated[assistantIndex] = { ...updated[assistantIndex], sources: parsed }
                  }
                  return updated
                })
              } else if (typeof parsed === 'string') {
                // Text chunk from the streaming response
                accumulated += parsed
                setMessages(prev => {
                  const updated = [...prev]
                  if (updated[assistantIndex]) {
                    updated[assistantIndex] = {
                      ...updated[assistantIndex],
                      content: accumulated,
                      sources,
                    }
                  }
                  return updated
                })
              }
            } catch {
              // Not JSON, skip
            }
          }
        }
      }

      // Final update to make sure the complete message is set
      setMessages(prev => {
        const updated = [...prev]
        if (updated[assistantIndex]) {
          updated[assistantIndex] = {
            ...updated[assistantIndex],
            content: accumulated || updated[assistantIndex].content,
            sources,
          }
        }
        return updated
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled, leave partial message
        return
      }
      const message = err instanceof Error ? err.message : 'Произошла неизвестная ошибка'
      setError(message)
      // Remove the empty assistant message on error
      setMessages(prev => {
        const updated = [...prev]
        if (updated[assistantIndex] && !updated[assistantIndex].content) {
          updated.splice(assistantIndex, 1)
        }
        return updated
      })
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleSuggestion = (text: string) => {
    sendMessage(text)
  }

  // Simple markdown-like rendering for AI responses
  const renderContent = (content: string) => {
    let html = content
      // Escape HTML
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      // Bold
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      // Italic
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Inline code
      .replace(/`(.*?)`/g, '<code class="px-1 py-0.5 rounded bg-bg-elevated text-accent text-xs">$1</code>')
      // Links
      .replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" class="text-accent hover:underline" target="_blank" rel="noopener">$1</a>')
      // Line breaks
      .replace(/\n\n/g, '</p><p class="mt-2">')
      .replace(/\n/g, '<br/>')
      // Lists (simple)
      .replace(/^- (.*?)(<br\/>|<\/p>)/gm, '<li class="ml-4 list-disc">$1</li>$2')

    html = '<p>' + html + '</p>'
    return html
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)] -mt-2">
      {/* Header */}
      <div className="flex items-center gap-3 pb-4 border-b border-border mb-4 flex-shrink-0">
        <div className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
          <Sparkles size={18} className="text-accent" />
        </div>
        <div>
          <h1 className="text-lg font-bold font-display">Библиотекарь</h1>
          <p className="text-xs text-text-muted">AI-помощник по базе знаний SLOBODA</p>
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4 min-h-0">
        {messages.length === 0 ? (
          /* Welcome state */
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <div className="w-16 h-16 rounded-2xl bg-accent/10 flex items-center justify-center mb-6">
              <BookOpen size={28} className="text-accent" />
            </div>
            <h2 className="text-xl font-display font-bold text-text mb-2">
              Добро пожаловать
            </h2>
            <p className="text-sm text-text-secondary max-w-md mb-8 leading-relaxed">
              Я Библиотекарь SLOBODA. Задайте вопрос, и я найду ответ
              в материалах нашей базы знаний. Если нужной информации нет,
              я честно об этом скажу.
            </p>
            <div className="flex flex-col gap-2 w-full max-w-md">
              <p className="text-xs text-text-muted uppercase tracking-wide mb-1">
                Попробуйте спросить
              </p>
              {WELCOME_SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => handleSuggestion(suggestion)}
                  className="
                    text-left px-4 py-3 rounded-lg
                    bg-bg-card border border-border
                    text-sm text-text-secondary
                    hover:text-text hover:border-border-hover
                    transition-colors duration-150
                  "
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          /* Chat messages */
          messages.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`
                  max-w-[80%] rounded-xl px-4 py-3
                  ${msg.role === 'user'
                    ? 'bg-accent text-white'
                    : 'bg-bg-card border border-border text-text'
                  }
                `}
              >
                {msg.role === 'assistant' ? (
                  <>
                    {msg.content ? (
                      <div
                        className="text-sm leading-relaxed prose-sm"
                        dangerouslySetInnerHTML={{ __html: renderContent(msg.content) }}
                      />
                    ) : (
                      <div className="flex items-center gap-2 text-text-muted text-sm">
                        <div className="flex gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '0ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '150ms' }} />
                          <span className="w-1.5 h-1.5 rounded-full bg-accent/60 animate-bounce" style={{ animationDelay: '300ms' }} />
                        </div>
                        Думаю...
                      </div>
                    )}
                    {/* Source references */}
                    {msg.sources && msg.sources.length > 0 && msg.content && (
                      <div className="mt-3 pt-2 border-t border-border/50">
                        <p className="text-[10px] uppercase tracking-wide text-text-muted mb-1.5">
                          Источники
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {msg.sources.map((src, j) => (
                            <span
                              key={j}
                              className="
                                inline-flex items-center gap-1
                                px-2 py-0.5 rounded
                                bg-bg-elevated text-text-secondary
                                text-[11px]
                              "
                              title={src.title}
                            >
                              <BookOpen size={10} />
                              {src.title.length > 40
                                ? src.title.slice(0, 40) + '...'
                                : src.title}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                )}
              </div>
            </div>
          ))
        )}

        {/* Error display */}
        {error && (
          <Card padding="sm" className="border-red-900/50 bg-red-900/10">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </div>
          </Card>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="flex-shrink-0 pt-4 border-t border-border">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder="Задайте вопрос..."
            rows={1}
            maxLength={1000}
            disabled={isStreaming}
            className="
              flex-1 px-4 py-3 rounded-xl resize-none
              bg-bg-card border border-border
              text-text placeholder:text-text-muted
              focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent/30
              transition-colors duration-150 text-sm
              disabled:opacity-50
            "
          />
          <Button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isStreaming}
            size="lg"
            className="rounded-xl h-[46px] w-[46px] !p-0 flex-shrink-0"
          >
            <Send size={18} />
          </Button>
        </div>
        <p className="text-[10px] text-text-muted mt-2 text-center">
          Библиотекарь отвечает на основе материалов базы знаний. Ответы могут быть неточными.
        </p>
      </div>
    </div>
  )
}
