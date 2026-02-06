const { getClient } = require('./anthropic');

const SYSTEM_PROMPT = `Ты — Библиотекарь SLOBODA, AI-помощник базы знаний сельского сообщества. Отвечай на вопросы пользователей, опираясь на материалы библиотеки. Если в контексте нет подходящей информации, честно скажи об этом. Отвечай на русском языке, кратко и по делу.`;

const MODEL = 'claude-haiku-4-20250514';
const MAX_TOKENS = 1024;
const MAX_CONTEXT_CHARS = 1500;
const MAX_HISTORY = 10;
const MAX_SEARCH_RESULTS = 5;

/**
 * Search published content (posts + knowledge_submissions) for relevant context.
 * Uses ILIKE across title, summary/description, and body fields.
 * Returns top results with truncated bodies.
 */
async function searchContext(question, db) {
    const pool = db.pool;

    // We'll run two queries: one on posts, one on knowledge_submissions
    // Then merge and take top results by relevance (simple: matching rows first)
    const searchTerm = `%${question}%`;

    let client;
    if (pool && typeof pool.connect === 'function') {
        client = await pool.connect();
    } else {
        // Fallback: use db functions directly
        return await searchContextViaDbFunctions(question, db);
    }

    try {
        // Search published posts
        const postsResult = await client.query(
            `SELECT id, title, summary, body, type, 'post' as source
             FROM posts
             WHERE status = 'published'
               AND (title ILIKE $1 OR summary ILIKE $1 OR body ILIKE $1)
             ORDER BY published_at DESC NULLS LAST
             LIMIT $2`,
            [searchTerm, MAX_SEARCH_RESULTS]
        );

        // Search approved/published knowledge submissions
        const knowledgeResult = await client.query(
            `SELECT id, title, description as summary, body, 'knowledge' as type, 'knowledge' as source
             FROM knowledge_submissions
             WHERE status IN ('approved', 'published')
               AND (title ILIKE $1 OR description ILIKE $1 OR body ILIKE $1)
             ORDER BY created_at DESC
             LIMIT $2`,
            [searchTerm, MAX_SEARCH_RESULTS]
        );

        // Merge and take top N
        const allResults = [...postsResult.rows, ...knowledgeResult.rows];
        return allResults.slice(0, MAX_SEARCH_RESULTS).map(row => ({
            id: row.id,
            title: row.title,
            source: row.source,
            type: row.type,
            excerpt: truncate(row.body || row.summary || '', MAX_CONTEXT_CHARS),
        }));
    } finally {
        client.release();
    }
}

/**
 * Fallback search using db.getPublishedPosts if direct pool access is not available.
 */
async function searchContextViaDbFunctions(question, db) {
    try {
        const posts = await db.getPublishedPosts({ search: question, limit: MAX_SEARCH_RESULTS });
        return (posts || []).slice(0, MAX_SEARCH_RESULTS).map(row => ({
            id: row.id,
            title: row.title,
            source: 'post',
            type: row.type,
            excerpt: truncate(row.body || row.summary || '', MAX_CONTEXT_CHARS),
        }));
    } catch (err) {
        console.error('[librarian] Fallback search failed:', err.message);
        return [];
    }
}

function truncate(text, maxLength) {
    if (!text) return '';
    // Strip HTML tags for context
    const clean = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (clean.length <= maxLength) return clean;
    return clean.slice(0, maxLength) + '...';
}

/**
 * Build the system prompt with context documents injected.
 */
function buildSystemPrompt(contextDocs) {
    if (!contextDocs || contextDocs.length === 0) {
        return SYSTEM_PROMPT + '\n\nВ библиотеке не найдено материалов по данному вопросу. Сообщи об этом пользователю.';
    }

    let contextBlock = '\n\n--- МАТЕРИАЛЫ ИЗ БИБЛИОТЕКИ ---\n';
    contextDocs.forEach((doc, i) => {
        contextBlock += `\n[${i + 1}] ${doc.title}\n${doc.excerpt}\n`;
    });
    contextBlock += '\n--- КОНЕЦ МАТЕРИАЛОВ ---\n';
    contextBlock += '\nИспользуй эти материалы для ответа. Ссылайся на них по названию, если цитируешь.';

    return SYSTEM_PROMPT + contextBlock;
}

/**
 * Build the messages array from chat history and the current question.
 * Only includes the last MAX_HISTORY messages.
 */
function buildMessages(question, chatHistory) {
    const messages = [];

    // Add recent history
    const recent = (chatHistory || []).slice(-MAX_HISTORY);
    for (const msg of recent) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    // Add the current question
    messages.push({ role: 'user', content: question });

    return messages;
}

/**
 * Stream a librarian response.
 * Returns an object with:
 *   - stream: async generator yielding text chunks
 *   - sources: array of source documents used as context
 *
 * @param {string} question - User's question
 * @param {Array} chatHistory - Previous messages [{role, content}]
 * @param {Object} db - Database module
 * @returns {{ stream: AsyncGenerator<string>, sources: Array }}
 */
async function streamLibrarianResponse(question, chatHistory, db) {
    const anthropic = getClient();
    if (!anthropic) {
        throw new Error('AI_NOT_CONFIGURED');
    }

    const startTime = Date.now();

    // Search for relevant context
    const contextDocs = await searchContext(question, db);

    // Build system prompt with context
    const systemPrompt = buildSystemPrompt(contextDocs);

    // Build messages
    const messages = buildMessages(question, chatHistory);

    // Create streaming request
    const stream = anthropic.messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: systemPrompt,
        messages,
    });

    // Create async generator that yields text chunks
    async function* textStream() {
        let fullText = '';

        try {
            for await (const event of stream) {
                if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
                    const chunk = event.delta.text;
                    fullText += chunk;
                    yield chunk;
                }
            }

            // Log after completion (non-blocking)
            const elapsed = Date.now() - startTime;
            const finalMessage = await stream.finalMessage();
            const usage = finalMessage?.usage;

            console.log(`[librarian] Response complete in ${elapsed}ms — ${usage?.input_tokens || '?'} in / ${usage?.output_tokens || '?'} out`);

            // Log to ai_processing_log if available
            if (db.logAIProcessing) {
                db.logAIProcessing({
                    knowledgeSubmissionId: null,
                    model: MODEL,
                    promptTokens: usage?.input_tokens || null,
                    completionTokens: usage?.output_tokens || null,
                    totalCostUsd: null,
                    processingTimeMs: elapsed,
                    result: { type: 'librarian_chat', question, contextCount: contextDocs.length },
                    error: null,
                }).catch(err => console.error('[librarian] Failed to log processing:', err.message));
            }
        } catch (err) {
            console.error('[librarian] Streaming error:', err.message);
            throw err;
        }
    }

    return {
        stream: textStream(),
        sources: contextDocs.map(doc => ({
            id: doc.id,
            title: doc.title,
            source: doc.source,
            type: doc.type,
        })),
    };
}

module.exports = { streamLibrarianResponse };
