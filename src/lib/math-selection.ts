type MathTextSource = {
  text?: string | null
  kind?: string | null
  mathSelectionLatex?: string | null
  mathAnchorLatex?: string | null
  mathDisplayText?: string | null
  mathPromptText?: string | null
}

export function normalizeMathText(input?: string | null) {
  return typeof input === 'string' ? input.replace(/\s+/g, ' ').trim() : ''
}

export function getMathAnchorLatex(source: MathTextSource) {
  return normalizeMathText(source.mathAnchorLatex) || normalizeMathText(source.mathSelectionLatex)
}

export function getMathDisplayText(source: MathTextSource) {
  return normalizeMathText(source.mathDisplayText) || normalizeMathText(source.text) || getMathAnchorLatex(source)
}

export function getMathPromptText(source: MathTextSource) {
  return normalizeMathText(source.mathPromptText) || getMathAnchorLatex(source) || getMathDisplayText(source)
}

export function parseMathSelectionPath(path?: string | null) {
  if (!path) {
    return [] as [number, number][]
  }

  return path
    .split('|')
    .map((part) => {
      const [rawStart, rawEnd] = part.split(':')
      const start = Number(rawStart)
      const end = Number(rawEnd)
      if (!Number.isFinite(start) || !Number.isFinite(end)) {
        return null
      }

      const normalizedStart = Math.max(0, Math.min(start, end))
      const normalizedEnd = Math.max(0, Math.max(start, end))
      if (normalizedStart === normalizedEnd) {
        return null
      }

      return [normalizedStart, normalizedEnd] as [number, number]
    })
    .filter((range): range is [number, number] => Boolean(range))
}

export function buildMathSelectionPath(ranges: Array<[number, number]>) {
  return ranges
    .map(([start, end]) => {
      const normalizedStart = Math.max(0, Math.min(start, end))
      const normalizedEnd = Math.max(0, Math.max(start, end))
      return `${normalizedStart}:${normalizedEnd}`
    })
    .join('|')
}
