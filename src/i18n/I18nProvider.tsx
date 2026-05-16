import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { getStoredLocale, storeLocale, type Locale } from './locales'
import { enUS } from './messages/en-US'
import { zhCN } from './messages/zh-CN'

const messages = {
  'zh-CN': zhCN,
  'en-US': enUS
}

export type MessageKey = keyof typeof zhCN

interface I18nContextValue {
  locale: Locale
  setLocale: (locale: Locale) => void
  t: (key: MessageKey, values?: Record<string, string | number>) => string
}

const I18nContext = createContext<I18nContextValue | null>(null)

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => getStoredLocale())

  useEffect(() => {
    document.documentElement.lang = locale
    storeLocale(locale)
  }, [locale])

  const value = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale: setLocaleState,
    t(key, values) {
      let text: string = messages[locale][key]
      Object.entries(values ?? {}).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value))
      })
      return text
    }
  }), [locale])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useI18n must be used inside I18nProvider')
  return context
}
