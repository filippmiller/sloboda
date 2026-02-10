import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { ru, enUS, es, de, fr } from 'date-fns/locale'
import type { Locale } from 'date-fns'

const localeMap: Record<string, Locale> = {
  ru,
  en: enUS,
  es,
  de,
  fr,
}

/**
 * Returns the date-fns Locale matching the current i18n language.
 * Falls back to Russian if language not in map.
 */
export function useDateLocale(): Locale {
  const { i18n } = useTranslation()
  return useMemo(() => localeMap[i18n.language] ?? ru, [i18n.language])
}
