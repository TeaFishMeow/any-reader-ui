export type UiTheme = 'light' | 'dark'
export type UiThemePreference = UiTheme | 'system'

export const DEFAULT_UI_THEME: UiTheme = 'light'
export const UI_THEME_STORAGE_KEY = 'anyreader.ui.theme'
export const UI_THEME_MEDIA_QUERY = '(prefers-color-scheme: dark)'

export function isUiTheme(value: string): value is UiTheme {
  return value === 'light' || value === 'dark'
}

export function isUiThemePreference(value: string): value is UiThemePreference {
  return value === 'system' || isUiTheme(value)
}

export function normalizeUiTheme(value?: string | null): UiTheme {
  return value === 'dark' ? 'dark' : DEFAULT_UI_THEME
}
