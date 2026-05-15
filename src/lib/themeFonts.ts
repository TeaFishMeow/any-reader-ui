export const englishFontOptions = [
  { value: 'noto-sans', label: 'Noto Sans', family: 'Noto Sans' },
  { value: 'noto-serif', label: 'Noto Serif', family: 'Noto Serif' }
] as const

export const chineseFontOptions = [
  { value: 'noto-sans-sc', label: 'Noto Sans SC', family: 'Noto Sans SC' },
  { value: 'noto-serif-sc', label: 'Noto Serif SC', family: 'Noto Serif SC' },
  { value: 'lxgw-wenkai', label: '霞鹜文楷', family: 'LXGW WenKai Screen' }
] as const

export type EnglishFont = (typeof englishFontOptions)[number]['value']
export type ChineseFont = (typeof chineseFontOptions)[number]['value']

export function englishFontFamily(value: string | null) {
  return englishFontOptions.find((font) => font.value === value)?.family ?? 'Noto Serif'
}

export function chineseFontFamily(value: string | null) {
  return chineseFontOptions.find((font) => font.value === value)?.family ?? 'Noto Serif SC'
}

export function isEnglishFont(value: string | null): value is EnglishFont {
  return englishFontOptions.some((font) => font.value === value)
}

export function isChineseFont(value: string | null): value is ChineseFont {
  return chineseFontOptions.some((font) => font.value === value)
}
