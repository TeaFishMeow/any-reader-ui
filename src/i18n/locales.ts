export type Locale = 'zh-CN' | 'en-US'

export const localeOptions: { value: Locale; labelKey: 'settings.language.zhCN' | 'settings.language.enUS' }[] = [
  { value: 'zh-CN', labelKey: 'settings.language.zhCN' },
  { value: 'en-US', labelKey: 'settings.language.enUS' }
]

const localeKey = 'anyreader.locale'

export function getStoredLocale(): Locale {
  return localStorage.getItem(localeKey) === 'en-US' ? 'en-US' : 'zh-CN'
}

export function storeLocale(locale: Locale) {
  localStorage.setItem(localeKey, locale)
}
