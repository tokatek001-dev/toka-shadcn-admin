import { I18nextProvider } from 'react-i18next'
import i18n, { initializeI18n } from '@/lib/i18n'

// Ensure i18next is configured before any consumer renders. Calling this at
// module load means the instance is ready before the first React render.
initializeI18n()

export function I18nProvider({ children }: { children: React.ReactNode }) {
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>
}
