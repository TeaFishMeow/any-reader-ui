import type { AppConfig } from '../../src_original_reference/types/domain'

export type ThemeMode = 'light' | 'dark'
export type ThemeStyle = 'default' | 'reading'

type ConfigWithTheme = AppConfig & {
  theme?: {
    mode?: ThemeMode
    style?: ThemeStyle
  }
}

export function themeMode(config: AppConfig | null): ThemeMode {
  return (config as ConfigWithTheme | null)?.theme?.mode === 'light' ? 'light' : 'dark'
}

export function setThemeMode(config: AppConfig, mode: ThemeMode): AppConfig {
  return { ...config, theme: { ...(config as ConfigWithTheme).theme, mode } } as AppConfig
}

export function themeStyle(config: AppConfig | null): ThemeStyle {
  return (config as ConfigWithTheme | null)?.theme?.style === 'reading' ? 'reading' : 'default'
}

export function setThemeStyle(config: AppConfig, style: ThemeStyle): AppConfig {
  return { ...config, theme: { ...(config as ConfigWithTheme).theme, style } } as AppConfig
}

export function applyTheme(mode: ThemeMode, style: ThemeStyle) {
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.themeStyle = style
  document.documentElement.style.colorScheme = mode
}
