const ALLOWED_TAGS = new Set([
  'p', 'br', 'b', 'i', 'u', 'strong', 'em', 'a', 'ul', 'ol', 'li',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'code',
  'img', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'span', 'div',
  'sub', 'sup', 'mark', 's', 'del',
])

const ALLOWED_ATTRS = new Set([
  'href', 'src', 'alt', 'title', 'class', 'target', 'rel', 'width', 'height',
])

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const clean = (node: Node): string => {
    if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ''
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const el = node as Element
    const tag = el.tagName.toLowerCase()

    if (!ALLOWED_TAGS.has(tag)) {
      return Array.from(el.childNodes).map(clean).join('')
    }

    const attrs = Array.from(el.attributes)
      .filter(a => ALLOWED_ATTRS.has(a.name.toLowerCase()))
      .filter(a => {
        if (a.name === 'href' || a.name === 'src') {
          const val = a.value.trim().toLowerCase()
          return val.startsWith('http://') || val.startsWith('https://') || val.startsWith('/') || val.startsWith('data:image/')
        }
        return true
      })
      .map(a => ` ${a.name}="${a.value.replace(/"/g, '&quot;')}"`)
      .join('')

    const children = Array.from(el.childNodes).map(clean).join('')
    const selfClosing = ['img', 'br', 'hr'].includes(tag)
    return selfClosing ? `<${tag}${attrs} />` : `<${tag}${attrs}>${children}</${tag}>`
  }

  return Array.from(doc.body.childNodes).map(clean).join('')
}
