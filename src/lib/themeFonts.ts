export const englishFontOptions = [
  { value: 'noto-sans', label: 'Noto Sans - 非衬线', family: 'Noto Sans' },
  { value: 'roboto', label: 'Roboto - 非衬线', family: 'Roboto' },
  { value: 'open-sans', label: 'Open Sans - 非衬线', family: 'Open Sans' },
  { value: 'lato', label: 'Lato - 非衬线', family: 'Lato' },
  { value: 'montserrat', label: 'Montserrat - 非衬线', family: 'Montserrat' },
  { value: 'noto-serif', label: 'Noto Serif - 衬线', family: 'Noto Serif' },
  { value: 'merriweather', label: 'Merriweather - 衬线', family: 'Merriweather' },
  { value: 'lora', label: 'Lora - 衬线', family: 'Lora' },
  { value: 'source-serif', label: 'Source Serif 4 - 衬线', family: 'Source Serif 4' },
  { value: 'libre-baskerville', label: 'Libre Baskerville - 衬线', family: 'Libre Baskerville' }
] as const

export const chineseFontOptions = [
  { value: 'noto-sans-sc', label: 'Noto Sans SC - 非衬线', family: 'Noto Sans SC' },
  { value: 'noto-serif-sc', label: 'Noto Serif SC - 衬线', family: 'Noto Serif SC' },
  { value: 'lxgw-wenkai', label: '霞鹜文楷 - 楷体', family: 'LXGW WenKai Screen' },
  { value: 'zcool-xiaowei', label: '站酷小薇体 - 衬线', family: 'ZCOOL XiaoWei' },
  { value: 'zcool-qingke', label: '站酷庆科黄油体 - 非衬线', family: 'ZCOOL QingKe HuangYou' },
  { value: 'zcool-kuaile', label: '站酷快乐体 - 显示', family: 'ZCOOL KuaiLe' },
  { value: 'ma-shan-zheng', label: '马善政毛笔楷书 - 手写', family: 'Ma Shan Zheng' },
  { value: 'long-cang', label: '龙藏体 - 手写', family: 'Long Cang' },
  { value: 'liu-jian-mao-cao', label: '刘建毛草 - 手写', family: 'Liu Jian Mao Cao' },
  { value: 'zhi-mang-xing', label: '志莽行书 - 手写', family: 'Zhi Mang Xing' }
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
