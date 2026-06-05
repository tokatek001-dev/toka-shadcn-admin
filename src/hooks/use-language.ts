import { useTranslation } from 'react-i18next'
import {
  type Language,
  DEFAULT_LANGUAGE,
  LANGUAGES,
  LANGUAGE_STORAGE_KEY,
} from '@/lib/i18n'

function normalizeLanguage(value: string): Language {
  const base = value.split('-')[0]
  return (LANGUAGES as readonly string[]).includes(base)
    ? (base as Language)
    : DEFAULT_LANGUAGE
}

export function useLanguage() {
  const { i18n } = useTranslation()
  const language = normalizeLanguage(i18n.language)

  const setLanguage = (lang: Language) => {
    void i18n.changeLanguage(lang)
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, lang)
    }
  }

  return { language, setLanguage, languages: LANGUAGES }
}
