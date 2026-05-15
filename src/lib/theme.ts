import type { AppConfig } from '../../src_original_reference/types/domain'
import {
  chineseFontFamily,
  englishFontFamily,
  isChineseFont,
  isEnglishFont,
  type ChineseFont,
  type EnglishFont
} from './themeFonts'

export type ThemeMode = 'system' | 'light' | 'dark'
export type ThemeStyle = 'default' | 'reading'
export type { ChineseFont, EnglishFont }

const themeModeKey = 'anyreader.theme.mode'
const themeStyleKey = 'anyreader.theme.style'
const themeEnglishFontKey = 'anyreader.theme.font.english'
const themeChineseFontKey = 'anyreader.theme.font.chinese'

export function themeMode(): ThemeMode {
  const mode = localStorage.getItem(themeModeKey)
  return mode === 'light' || mode === 'dark' || mode === 'system' ? mode : 'system'
}

export function themeStyle(): ThemeStyle {
  return localStorage.getItem(themeStyleKey) === 'default' ? 'default' : 'reading'
}

export function themeEnglishFont(): EnglishFont {
  const font = localStorage.getItem(themeEnglishFontKey)
  return isEnglishFont(font) ? font : 'georgia'
}

export function themeChineseFont(): ChineseFont {
  const font = localStorage.getItem(themeChineseFontKey)
  return isChineseFont(font) ? font : 'noto-serif-sc'
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
  document.documentElement.style.fontFamily = `"${englishFontFamily(themeEnglishFont())}", "${chineseFontFamily(themeChineseFont())}", "PingFang SC", "Microsoft YaHei", Arial, sans-serif`
}
