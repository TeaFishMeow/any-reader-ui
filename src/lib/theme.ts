import type { AppConfig } from '../../src_original_reference/types/domain'

export type ThemeMode = 'light' | 'dark'

type ConfigWithTheme = AppConfig & {
  theme?: {
    mode?: ThemeMode
  }
}

export function themeMode(config: AppConfig | null): ThemeMode {
  return (config as ConfigWithTheme | null)?.theme?.mode === 'light' ? 'light' : 'dark'
}

export function setThemeMode(config: AppConfig, mode: ThemeMode): AppConfig {
  return { ...config, theme: { ...(config as ConfigWithTheme).theme, mode } } as AppConfig
}

export function applyTheme(mode: ThemeMode) {
  document.documentElement.dataset.theme = mode
  document.documentElement.style.colorScheme = mode
}
