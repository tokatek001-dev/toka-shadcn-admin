import enCommon from '@/locales/en/common.json'
import viCommon from '@/locales/vi/common.json'
import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

export const LANGUAGES = ['en', 'vi'] as const
export type Language = (typeof LANGUAGES)[number]

export const DEFAULT_LANGUAGE: Language = 'en'
export const LANGUAGE_STORAGE_KEY = 'i18next.language'

const resources = {
  en: { common: enCommon },
  vi: { common: viCommon },
} as const

function isLanguage(value: string | null): value is Language {
  return value !== null && (LANGUAGES as readonly string[]).includes(value)
}

function detectInitialLanguage(): Language {
  if (typeof window === 'undefined') return DEFAULT_LANGUAGE

  const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY)
  if (isLanguage(stored)) return stored

  const system = window.navigator.language?.split('-')[0]
  if (isLanguage(system ?? null)) return system as Language

  return DEFAULT_LANGUAGE
}

// Initialize i18next synchronously before React renders. Resources are bundled,
// so no async loading is required and the first paint is already translated.
export function initializeI18n() {
  if (i18n.isInitialized) return i18n

  void i18n.use(initReactI18next).init({
    resources,
    lng: detectInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    defaultNS: 'common',
    ns: ['common'],
    supportedLngs: LANGUAGES,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  })

  return i18n
}

export default i18n
