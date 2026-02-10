const { callClaude } = require('./ai/anthropic');

const SUPPORTED_LANGUAGES = {
    en: 'English',
    es: 'Spanish',
    de: 'German',
    fr: 'French',
};

/**
 * Translate content to a target language using Claude API.
 * @param {{ title?: string, summary?: string, body?: string }} content
 * @param {string} targetLang - Language code (en, es, de, fr)
 * @param {string} sourceLang - Source language code (default: ru)
 * @returns {{ title?: string, summary?: string, body?: string }}
 */
async function translateContent(content, targetLang, sourceLang = 'ru') {
    const langName = SUPPORTED_LANGUAGES[targetLang];
    if (!langName) {
        throw new Error(`Unsupported language: ${targetLang}`);
    }

    const parts = [];
    if (content.title) parts.push(`<title>${content.title}</title>`);
    if (content.summary) parts.push(`<summary>${content.summary}</summary>`);
    if (content.body) parts.push(`<body>${content.body}</body>`);

    if (parts.length === 0) return {};

    const systemPrompt = `You are a professional translator. Translate the following content from ${sourceLang === 'ru' ? 'Russian' : sourceLang} to ${langName}.
Preserve all HTML tags and formatting exactly. Only translate the text content.
Return the translation in the same XML wrapper tags (title, summary, body) as provided.
Do not add explanations. Output only the translated content in the same XML format.`;

    const result = await callClaude({
        model: 'claude-haiku-4-20250514',
        maxTokens: 8192,
        systemPrompt,
        userPrompt: parts.join('\n'),
    });

    const translated = {};
    const titleMatch = result.content.match(/<title>([\s\S]*?)<\/title>/);
    const summaryMatch = result.content.match(/<summary>([\s\S]*?)<\/summary>/);
    const bodyMatch = result.content.match(/<body>([\s\S]*?)<\/body>/);

    if (titleMatch) translated.title = titleMatch[1].trim();
    if (summaryMatch) translated.summary = summaryMatch[1].trim();
    if (bodyMatch) translated.body = bodyMatch[1].trim();

    return translated;
}

/**
 * Translate content to all supported languages and save to database.
 * Runs in background, does not block the caller.
 * @param {object} db - Database module
 * @param {number} contentId
 * @param {string} contentType - 'post', 'knowledge', 'thread', 'comment'
 * @param {{ title?: string, summary?: string, body?: string }} content
 */
async function translateAndSave(db, contentId, contentType, content) {
    const languages = Object.keys(SUPPORTED_LANGUAGES);

    for (const lang of languages) {
        try {
            const translated = await translateContent(content, lang);
            await db.saveContentTranslation({
                contentType,
                contentId,
                language: lang,
                title: translated.title || null,
                summary: translated.summary || null,
                body: translated.body || null,
                status: 'completed',
            });
            console.log(`[i18n] Translated ${contentType}:${contentId} to ${lang}`);
        } catch (err) {
            console.error(`[i18n] Failed to translate ${contentType}:${contentId} to ${lang}:`, err.message);
            // Save failed status so we can retry later
            try {
                await db.saveContentTranslation({
                    contentType,
                    contentId,
                    language: lang,
                    title: null,
                    summary: null,
                    body: null,
                    status: 'failed',
                });
            } catch {
                // Ignore save failure
            }
        }
    }
}

/**
 * Fire-and-forget translation. Catches all errors internally.
 */
function triggerTranslation(db, contentId, contentType, content) {
    translateAndSave(db, contentId, contentType, content).catch(err => {
        console.error(`[i18n] Translation job failed for ${contentType}:${contentId}:`, err.message);
    });
}

module.exports = {
    translateContent,
    translateAndSave,
    triggerTranslation,
    SUPPORTED_LANGUAGES,
};
