import type { AppConfig } from '../../src_original_reference/types/domain'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeStyle = 'default' | 'reading'
export type EnglishFont = 'inter' | 'merriweather' | 'source-serif'
export type ChineseFont = 'noto-sans-sc' | 'noto-serif-sc' | 'lxgw-wenkai'

const themeModeKey = 'anyreader.theme.mode'
const themeStyleKey = 'anyreader.theme.style'
const themeEnglishFontKey = 'anyreader.theme.font.english'
const themeChineseFontKey = 'anyreader.theme.font.chinese'

export const englishFontOptions: { value: EnglishFont; label: string; family: string }[] = [
  { value: 'inter', label: 'Inter', family: 'Inter' },
  { value: 'merriweather', label: 'Merriweather', family: 'Merriweather' },
  { value: 'source-serif', label: 'Source Serif 4', family: 'Source Serif 4' }
]

export const chineseFontOptions: { value: ChineseFont; label: string; family: string }[] = [
  { value: 'noto-sans-sc', label: 'Noto Sans SC', family: 'Noto Sans SC' },
  { value: 'noto-serif-sc', label: 'Noto Serif SC', family: 'Noto Serif SC' },
  { value: 'lxgw-wenkai', label: '霞鹜文楷', family: 'LXGW WenKai Screen' }
]

export function themeMode(): ThemeMode {
  const mode = localStorage.getItem(themeModeKey)
  return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system'
}

export function themeStyle(): ThemeStyle {
  return localStorage.getItem(themeStyleKey) === 'default' ? 'default' : 'reading'
}

export function themeEnglishFont(): EnglishFont {
  const font = localStorage.getItem(themeEnglishFontKey)
  return font === 'inter' || font === 'source-serif' ? font : 'merriweather'
}

export function themeChineseFont(): ChineseFont {
  const font = localStorage.getItem(themeChineseFontKey)
  return font === 'noto-sans-sc' || font === 'lxgw-wenkai' ? font : 'noto-serif-sc'
}

export function setThemeMode(config: AppConfig, mode: ThemeMode): AppConfig {
  localStorage.setItem(themeModeKey, mode)
  return { ...config }
}

export function setThemeStyle(config: AppConfig, style: ThemeStyle): AppConfig {
  localStorage.setItem(themeStyleKey, style)
  return { ...config }
}

export function setThemeEnglishFont(config: AppConfig, font: EnglishFont): AppConfig {
  localStorage.setItem(themeEnglishFontKey, font)
  return { ...config }
}

export function setThemeChineseFont(config: AppConfig, font: ChineseFont): AppConfig {
  localStorage.setItem(themeChineseFontKey, font)
  return { ...config }
}

export function applyTheme(mode: ThemeMode, style: ThemeStyle) {
  document.documentElement.dataset.theme = mode
  document.documentElement.dataset.themeStyle = style
  document.documentElement.style.colorScheme = mode === 'system' ? 'light dark' : mode
  const english = englishFontOptions.find((font) => font.value === themeEnglishFont()) ?? englishFontOptions[1]
  const chinese = chineseFontOptions.find((font) => font.value === themeChineseFont()) ?? chineseFontOptions[1]
  document.documentElement.style.fontFamily = `"${english.family}", "${chinese.family}", Arial, sans-serif`
}
