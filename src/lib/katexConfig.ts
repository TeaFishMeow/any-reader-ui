import type { KatexOptions } from 'katex'

export const katexOptions: KatexOptions = {
  output: 'htmlAndMathml',
  throwOnError: false,
  strict: 'ignore',
  trust: false
}

export const katexDelimiters = [
  { left: '$$', right: '$$', display: true },
  { left: '\\[', right: '\\]', display: true },
  { left: '\\(', right: '\\)', display: false },
  { left: '$', right: '$', display: false }
] as const

export const katexSourceAttribute = 'data-katex-source'
export const katexDisplayAttribute = 'data-katex-display'
