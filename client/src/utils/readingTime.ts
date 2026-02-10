import i18n from '@/i18n'

/**
 * Estimate reading time from HTML or plain text content.
 * Strips HTML tags, counts words, divides by 200 wpm.
 * Returns minutes (minimum 1).
 */
export function estimateReadingTime(html: string | null | undefined): number {
  if (!html) return 1
  const text = html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
  const wordCount = text.split(' ').filter(Boolean).length
  return Math.max(1, Math.ceil(wordCount / 200))
}

export function formatReadingTime(minutes: number): string {
  return i18n.t('common.time.readingTime', { count: minutes })
}
