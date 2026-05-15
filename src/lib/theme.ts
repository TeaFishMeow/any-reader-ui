import type { AppConfig } from '../../src_original_reference/types/domain'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeStyle = 'default' | 'reading'

type ConfigWithTheme = AppConfig & {
  theme?: {
    mode?: ThemeMode
    style?: ThemeStyle
  }
}

export function themeMode(config: AppConfig | null): ThemeMode {
  const mode = (config as ConfigWithTheme | null)?.theme?.mode
  return mode === 'light' || mode === 'dark' ? mode : 'system'
}

export function setThemeMode(config: AppConfig, mode: ThemeMode): AppConfig {
  return { ...config, theme: { ...(config as ConfigWithTheme).theme, mode } } as AppConfig
}

export function themeStyle(config: AppConfig | null): ThemeStyle {
  return (config as ConfigWithTheme | null)?.theme?.style === 'default' ? 'default' : 'reading'
}

export function setThemeStyle(config: AppConfig, style: ThemeStyle): AppConfig {
  return { ...config, theme: { ...(config as ConfigWithTheme).theme, style } } as AppConfig
}

export function applyTheme(mode: ThemeMode, style: ThemeStyle) {
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.themeStyle = style
  document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode
}
