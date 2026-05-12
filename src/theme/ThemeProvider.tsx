import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import {
  DEFAULT_UI_THEME,
  UI_THEME_MEDIA_QUERY,
  UI_THEME_STORAGE_KEY,
  isUiThemePreference,
  normalizeUiTheme,
  type UiTheme,
  type UiThemePreference
} from './theme'

interface ThemeContextValue {
  theme: UiTheme
  themePreference: UiThemePreference
  setTheme: (theme: UiTheme) => void
  setThemePreference: (preference: UiThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function resolveSystemTheme() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return DEFAULT_UI_THEME
  }

  return window.matchMedia(UI_THEME_MEDIA_QUERY).matches ? 'dark' : 'light'
}

function resolveInitialThemePreference(): UiThemePreference {
  if (typeof window === 'undefined') {
    return 'system'
  }

  const saved = window.localStorage.getItem(UI_THEME_STORAGE_KEY)
  if (!saved) {
    return 'system'
  }

  if (isUiThemePreference(saved)) {
    return saved
  }

  return normalizeUiTheme(saved)
}

function applyThemeToDocument(theme: UiTheme, themePreference: UiThemePreference) {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.dataset.theme = theme
  root.dataset.themePreference = themePreference
  root.style.colorScheme = theme
}

export function initializeThemeDocumentState() {
  const themePreference = resolveInitialThemePreference()
  const theme = themePreference === 'system' ? resolveSystemTheme() : themePreference
  applyThemeToDocument(theme, themePreference)
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themePreference, setThemePreference] = useState<UiThemePreference>(() => resolveInitialThemePreference())
  const [systemTheme, setSystemTheme] = useState<UiTheme>(() => resolveSystemTheme())

  useEffect(() => {
    if (themePreference !== 'system') {
      return
    }

    setSystemTheme(resolveSystemTheme())
  }, [themePreference])

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(UI_THEME_STORAGE_KEY, themePreference)
  }, [themePreference])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return
    }

    const mediaQueryList = window.matchMedia(UI_THEME_MEDIA_QUERY)
    const handleChange = () => {
      setSystemTheme(mediaQueryList.matches ? 'dark' : 'light')
    }

    if (typeof mediaQueryList.addEventListener === 'function') {
      mediaQueryList.addEventListener('change', handleChange)
      return () => mediaQueryList.removeEventListener('change', handleChange)
    }

    mediaQueryList.addListener(handleChange)
    return () => mediaQueryList.removeListener(handleChange)
  }, [])

  const theme = themePreference === 'system' ? systemTheme : themePreference

  useEffect(() => {
    applyThemeToDocument(theme, themePreference)
  }, [theme, themePreference])

  const value = useMemo<ThemeContextValue>(
    () => ({
      theme,
      themePreference,
      setTheme(nextTheme) {
        setThemePreference(nextTheme)
      },
      setThemePreference
    }),
    [theme, themePreference]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useThemeContext() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme must be used inside ThemeProvider')
  }

  return context
}
