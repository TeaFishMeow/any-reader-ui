export const englishFontOptions = [
  { value: 'garamond', labelKey: 'font.garamond', family: 'Garamond' },
  { value: 'georgia', labelKey: 'font.georgia', family: 'Georgia' },
  { value: 'merriweather', labelKey: 'font.merriweather', family: 'Merriweather' },
  { value: 'noto-sans', labelKey: 'font.notoSans', family: 'Noto Sans' },
  { value: 'noto-serif', labelKey: 'font.notoSerif', family: 'Noto Serif' },
  { value: 'open-sans', labelKey: 'font.openSans', family: 'Open Sans' },
  { value: 'palatino', labelKey: 'font.palatino', family: 'Palatino' },
  { value: 'roboto', labelKey: 'font.roboto', family: 'Roboto' },
  { value: 'times-new-roman', labelKey: 'font.timesNewRoman', family: 'Times New Roman' }
] as const

export const chineseFontOptions = [
  { value: 'noto-sans-sc', labelKey: 'font.notoSansSC', family: 'Noto Sans SC' },
  { value: 'noto-serif-sc', labelKey: 'font.notoSerifSC', family: 'Noto Serif SC' },
  { value: 'lxgw-wenkai', labelKey: 'font.lxgwWenkai', family: 'LXGW WenKai Screen' }
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
