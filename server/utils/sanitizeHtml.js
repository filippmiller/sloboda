const ALLOWED_TAGS = new Set([
    'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
    'h3', 'h4', 'h5', 'span', 'div',
]);

const ALLOWED_ATTRS = new Set(['href', 'class', 'rel', 'target']);

function escapeText(text) {
    return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function isSafeUrl(value) {
    const val = String(value || '').trim().toLowerCase();
    return val.startsWith('https://') || val.startsWith('http://') || val.startsWith('/');
}

function sanitizeHtml(input) {
    if (!input || typeof input !== 'string') return '';

    let html = input
        .replace(/```(?:html)?/gi, '')
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
        .replace(/on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');

    html = html.replace(/<\/?([a-z0-9]+)([^>]*)>/gi, (match, rawTag, rawAttrs) => {
        const isClose = match.startsWith('</');
        const tag = rawTag.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) return '';
        if (isClose) return `</${tag}>`;

        const attrs = [];
        const attrRe = /([a-z0-9:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
        let attrMatch;
        while ((attrMatch = attrRe.exec(rawAttrs))) {
            const name = attrMatch[1].toLowerCase();
            const value = attrMatch[3] ?? attrMatch[4] ?? attrMatch[5] ?? '';
            if (!ALLOWED_ATTRS.has(name)) continue;
            if ((name === 'href') && !isSafeUrl(value)) continue;
            attrs.push(`${name}="${escapeText(value)}"`);
        }

        if (tag === 'a') {
            attrs.push('rel="noopener noreferrer"');
            if (!attrs.some((a) => a.startsWith('target='))) {
                attrs.push('target="_blank"');
            }
        }

        return attrs.length ? `<${tag} ${attrs.join(' ')}>` : `<${tag}>`;
    });

    return html;
}

function sanitizePlain(input, maxLen = 500) {
    if (input == null) return '';
    return String(input).replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

module.exports = { sanitizeHtml, sanitizePlain, escapeText };
