export function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`
}

export function hashString(input: string) {
  let hash = 5381
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index)
  }
  return Math.abs(hash >>> 0).toString(36)
}

export function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/^>\s?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~]/g, '')
    .replace(/^\s*[-+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function makeSummary(markdown: string, limit = 160) {
  const plain = markdownToPlainText(markdown).replace(/\s+/g, ' ').trim()
  if (plain.length <= limit) {
    return plain
  }
  return `${plain.slice(0, limit).trim()}…`
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

export function truncateText(input: string, limit: number) {
  if (input.length <= limit) {
    return input
  }
  return `${input.slice(0, limit).trim()}…`
}
