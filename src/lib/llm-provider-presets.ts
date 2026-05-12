export const OPENAI_COMPATIBLE_PROVIDER = 'openai-compatible'
export const DEEPSEEK_PROVIDER = 'deepseek'

export const DEEPSEEK_PRESETS = [
  {
    key: 'deepseek-v4-flash',
    label: 'DeepSeek V4 Flash',
    displayName: 'DeepSeek V4 Flash'
  },
  {
    key: 'deepseek-v4-flash-thinking-high',
    label: 'DeepSeek V4 Flash / Thinking / High',
    displayName: 'DeepSeek V4 Flash Thinking High'
  },
  {
    key: 'deepseek-v4-flash-thinking-max',
    label: 'DeepSeek V4 Flash / Thinking / Max',
    displayName: 'DeepSeek V4 Flash Thinking Max'
  },
  {
    key: 'deepseek-v4-pro',
    label: 'DeepSeek V4 Pro',
    displayName: 'DeepSeek V4 Pro'
  },
  {
    key: 'deepseek-v4-pro-thinking-high',
    label: 'DeepSeek V4 Pro / Thinking / High',
    displayName: 'DeepSeek V4 Pro Thinking High'
  },
  {
    key: 'deepseek-v4-pro-thinking-max',
    label: 'DeepSeek V4 Pro / Thinking / Max',
    displayName: 'DeepSeek V4 Pro Thinking Max'
  }
] as const

export type LlmProvider = typeof OPENAI_COMPATIBLE_PROVIDER | typeof DEEPSEEK_PROVIDER
export type DeepseekPresetKey = (typeof DEEPSEEK_PRESETS)[number]['key']

export function getDeepseekPresetByKey(key: string | null | undefined) {
  return DEEPSEEK_PRESETS.find((preset) => preset.key === key) ?? null
}
