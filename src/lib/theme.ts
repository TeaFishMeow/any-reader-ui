import type { AppConfig } from '../../src_original_reference/types/domain'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeStyle = 'default' | 'reading'

const themeModeKey = 'anyreader.theme.mode'
const themeStyleKey = 'anyreader.theme.style'

export function themeMode(): ThemeMode {
  const mode = localStorage.getItem(themeModeKey)
  return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system'
}

export function themeStyle(): ThemeStyle {
  return localStorage.getItem(themeStyleKey) === 'default' ? 'default' : 'reading'
}

export function setThemeMode(config: AppConfig, mode: ThemeMode): AppConfig {
  localStorage.setItem(themeModeKey, mode)
  return { ...config }
}

export function setThemeStyle(config: AppConfig, style: ThemeStyle): AppConfig {
  localStorage.setItem(themeStyleKey, style)
  return { ...config }
}

export function applyTheme(mode: ThemeMode, style: ThemeStyle) {
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.themeStyle = style
  document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode
}
