import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_UI_LOCALE,
  UI_LOCALE_STORAGE_KEY,
  isUiLocalePreference,
  normalizeUiLocale,
  translateMessage,
  type TranslateFn,
  type TranslateParams,
  type UiLocale,
  type UiLocalePreference
} from './messages'

interface I18nContextValue {
  locale: UiLocale
  localePreference: UiLocalePreference
  setLocale: (locale: UiLocale) => void
  setLocalePreference: (preference: UiLocalePreference) => void
  t: TranslateFn
}

const I18nContext = createContext<I18nContextValue | null>(null)

function resolveSystemLocale() {
  if (typeof window === 'undefined') {
    return DEFAULT_UI_LOCALE
  }

  const preferred = window.navigator.languages?.[0] ?? window.navigator.language
  return normalizeUiLocale(preferred)
}

function resolveInitialLocalePreference(): UiLocalePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const saved = window.localStorage.getItem(UI_LOCALE_STORAGE_KEY)
  if (!saved) {
    return 'system'
  }

  if (isUiLocalePreference(saved)) {
    return saved
  }

  return normalizeUiLocale(saved)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [localePreference, setLocalePreference] = useState<UiLocalePreference>(() => resolveInitialLocalePreference())
  const [systemLocale, setSystemLocale] = useState<UiLocale>(() => resolveSystemLocale())

  useEffect(() => {
    if (localePreference !== 'system') {
      return
    }

    setSystemLocale(resolveSystemLocale())
  }, [localePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(UI_LOCALE_STORAGE_KEY, localePreference)
  }, [localePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const handleLanguageChange = () => {
      setSystemLocale(resolveSystemLocale())
    }

    window.addEventListener('languagechange', handleLanguageChange)
    return () => window.removeEventListener('languagechange', handleLanguageChange)
  }, [])

  const locale = localePreference === 'system' ? systemLocale : localePreference

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      localePreference,
      setLocale(nextLocale) {
        setLocalePreference(nextLocale)
      },
      setLocalePreference,
      t(key: string, params?: TranslateParams) {
        return translateMessage(locale, key, params)
      }
    }),
    [locale, localePreference]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18nContext() {
  const context = useContext(I18nContext)
  if (!context) {
    throw new Error('useI18n must be used inside I18nProvider')
  }

  return context
}
