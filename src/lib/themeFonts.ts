export const englishFontOptions = [
  { value: 'garamond', label: 'Garamond', family: 'Garamond' },
  { value: 'georgia', label: 'Georgia', family: 'Georgia' },
  { value: 'merriweather', label: 'Merriweather', family: 'Merriweather' },
  { value: 'noto-sans', label: 'Noto Sans', family: 'Noto Sans' },
  { value: 'noto-serif', label: 'Noto Serif', family: 'Noto Serif' },
  { value: 'open-sans', label: 'Open Sans', family: 'Open Sans' },
  { value: 'palatino', label: 'Palatino', family: 'Palatino' },
  { value: 'roboto', label: 'Roboto', family: 'Roboto' },
  { value: 'times-new-roman', label: 'Times New Roman', family: 'Times New Roman' }
] as const

export const chineseFontOptions = [
  { value: 'noto-sans-sc', label: '思源黑体', family: 'Noto Sans SC' },
  { value: 'noto-serif-sc', label: '思源宋体', family: 'Noto Serif SC' },
  { value: 'lxgw-wenkai', label: '霞鹜文楷', family: 'LXGW WenKai Screen' }
] as const

export type EnglishFont = (typeof englishFontOptions)[number]['value']
export type ChineseFont = (typeof chineseFontOptions)[number]['value']

export function englishFontFamily(value: string | null) {
  return englishFontOptions.find((font) => font.value === value)?.family ?? 'Palatino'
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
