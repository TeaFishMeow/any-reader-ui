export function normalizeVaultPath(input: string) {
  if (!input) {
    return ''
  }

  const normalized = input.replace(/\\/g, '/').trim()
  if (!normalized) {
    return ''
  }

  if (normalized.startsWith('/') || /^[A-Za-z]:/.test(normalized)) {
    return null
  }

  const stack: string[] = []
  for (const segment of normalized.split('/')) {
    if (!segment || segment === '.') {
      continue
    }

    if (segment === '..') {
      if (stack.length === 0) {
        return null
      }
      stack.pop()
      continue
    }

    stack.push(segment)
  }

  return stack.join('/')
}

export function dirnameVaultPath(path: string) {
  const normalized = normalizeVaultPath(path)
  if (!normalized) {
    return ''
  }

  const segments = normalized.split('/')
  segments.pop()
  return segments.join('/')
}

export function basenameVaultPath(path: string) {
  const normalized = normalizeVaultPath(path)
  if (normalized === null) {
    return ''
  }

  const segments = normalized.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? ''
}

export function stripMarkdownExtension(path: string) {
  return path.replace(/\.md$/i, '')
}

export function basenameWithoutExtension(path: string) {
  return stripMarkdownExtension(basenameVaultPath(path))
}

export function joinVaultPath(baseDirectory: string, relativePath: string) {
  const normalizedRelative = relativePath.replace(/\\/g, '/').trim()
  if (!normalizedRelative) {
    return normalizeVaultPath(baseDirectory)
  }

  if (/^[A-Za-z]:/.test(normalizedRelative)) {
    return null
  }

  const candidate = normalizedRelative.startsWith('/')
    ? normalizedRelative.slice(1)
    : [normalizeVaultPath(baseDirectory) ?? '', normalizedRelative].filter(Boolean).join('/')

  return normalizeVaultPath(candidate)
}
