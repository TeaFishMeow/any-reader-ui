const normalizeLatexCache = new Map<string, string>()

const centeredDotsOperatorChars = new Set(['+', '-', '=', '<', '>', '*', '/', '|', ':'])
const centeredDotsOperatorCommands = new Set([
  '\\approx',
  '\\ast',
  '\\cap',
  '\\cdot',
  '\\circ',
  '\\cong',
  '\\cup',
  '\\div',
  '\\equiv',
  '\\ge',
  '\\geq',
  '\\geqslant',
  '\\gt',
  '\\land',
  '\\le',
  '\\leq',
  '\\leqslant',
  '\\lor',
  '\\lt',
  '\\mid',
  '\\neq',
  '\\ne',
  '\\odot',
  '\\ominus',
  '\\oplus',
  '\\oslash',
  '\\otimes',
  '\\pm',
  '\\propto',
  '\\sim',
  '\\subset',
  '\\subseteq',
  '\\supset',
  '\\supseteq',
  '\\times',
  '\\to',
  '\\rightarrow',
  '\\Rightarrow',
  '\\longrightarrow',
  '\\wedge',
  '\\vee'
])

export function normalizeLatexForMathLive(latex: string) {
  const cached = normalizeLatexCache.get(latex)
  if (cached !== undefined) {
    return cached
  }

  let normalized = latex
  normalized = normalized.replace(/\\pmb(?![A-Za-z])/g, '\\boldsymbol')
  normalized = replaceSubstack(normalized)
  normalized = replaceDelimitedArrays(normalized)
  normalized = replaceDots(normalized)

  normalizeLatexCache.set(latex, normalized)
  return normalized
}

function replaceSubstack(source: string) {
  const command = '\\substack'
  let cursor = 0
  let result = ''

  while (cursor < source.length) {
    const commandIndex = source.indexOf(command, cursor)
    if (commandIndex < 0) {
      result += source.slice(cursor)
      break
    }

    const nextCharacter = source[commandIndex + command.length] ?? ''
    if (isAsciiLetter(nextCharacter)) {
      result += source.slice(cursor, commandIndex + 1)
      cursor = commandIndex + 1
      continue
    }

    result += source.slice(cursor, commandIndex)
    const group = readBalancedGroup(source, commandIndex + command.length)
    if (!group) {
      result += command
      cursor = commandIndex + command.length
      continue
    }

    result += `\\begin{array}{c}${group.content}\\end{array}`
    cursor = group.end
  }

  return result
}

function replaceDots(source: string) {
  const command = '\\dots'
  let cursor = 0
  let result = ''

  while (cursor < source.length) {
    const commandIndex = source.indexOf(command, cursor)
    if (commandIndex < 0) {
      result += source.slice(cursor)
      break
    }

    const nextCharacter = source[commandIndex + command.length] ?? ''
    if (isAsciiLetter(nextCharacter)) {
      result += source.slice(cursor, commandIndex + 1)
      cursor = commandIndex + 1
      continue
    }

    result += source.slice(cursor, commandIndex)
    result += shouldUseCenteredDots(source, commandIndex, command.length) ? '\\cdots' : '\\ldots'
    cursor = commandIndex + command.length
  }

  return result
}

function replaceDelimitedArrays(source: string) {
  const command = '\\left'
  let cursor = 0
  let result = ''

  while (cursor < source.length) {
    const commandIndex = source.indexOf(command, cursor)
    if (commandIndex < 0) {
      result += source.slice(cursor)
      break
    }

    result += source.slice(cursor, commandIndex)
    const rewrite = readDelimitedArrayRewrite(source, commandIndex)
    if (!rewrite) {
      result += source.slice(commandIndex, commandIndex + 1)
      cursor = commandIndex + 1
      continue
    }

    result += rewrite.latex
    cursor = rewrite.end
  }

  return result
}

function readDelimitedArrayRewrite(source: string, startIndex: number) {
  let cursor = skipWhitespace(source, startIndex + '\\left'.length)
  const leftDelimiter = readLeftArrayDelimiter(source, cursor)
  if (!leftDelimiter) {
    return null
  }

  cursor = skipWhitespace(source, leftDelimiter.end)
  if (!source.startsWith('\\begin{array}', cursor)) {
    return null
  }

  cursor += '\\begin{array}'.length
  const columnSpec = readBalancedGroup(source, cursor)
  if (!columnSpec) {
    return null
  }

  const arrayBody = readEnvironmentBody(source, 'array', columnSpec.end)
  if (!arrayBody || arrayBody.content.includes('\\hline')) {
    return null
  }

  cursor = skipWhitespace(source, arrayBody.end)
  const rightDelimiter = readRightArrayDelimiter(source, cursor)
  if (!rightDelimiter) {
    return null
  }

  const latex = buildDelimitedArrayRewrite(leftDelimiter.kind, rightDelimiter.kind, columnSpec.content, arrayBody.content)
  if (!latex) {
    return null
  }

  return {
    latex,
    end: rightDelimiter.end
  }
}

function readLeftArrayDelimiter(source: string, startIndex: number) {
  if (source.startsWith('\\lVert', startIndex)) {
    return {
      kind: 'double-bar' as const,
      end: startIndex + '\\lVert'.length
    }
  }

  if (source.startsWith('\\Vert', startIndex)) {
    return {
      kind: 'double-bar' as const,
      end: startIndex + '\\Vert'.length
    }
  }

  if (source.startsWith('\\|', startIndex)) {
    return {
      kind: 'double-bar' as const,
      end: startIndex + '\\|'.length
    }
  }

  if (source.startsWith('\\{', startIndex)) {
    return {
      kind: 'left-brace' as const,
      end: startIndex + '\\{'.length
    }
  }

  if (source.startsWith('\\lbrace', startIndex)) {
    return {
      kind: 'left-brace' as const,
      end: startIndex + '\\lbrace'.length
    }
  }

  if (source.startsWith('(', startIndex)) {
    return {
      kind: 'paren' as const,
      end: startIndex + 1
    }
  }

  if (source.startsWith('\\lparen', startIndex)) {
    return {
      kind: 'paren' as const,
      end: startIndex + '\\lparen'.length
    }
  }

  if (source.startsWith('[', startIndex)) {
    return {
      kind: 'bracket' as const,
      end: startIndex + 1
    }
  }

  if (source.startsWith('\\lbrack', startIndex)) {
    return {
      kind: 'bracket' as const,
      end: startIndex + '\\lbrack'.length
    }
  }

  if (source.startsWith('\\lbracket', startIndex)) {
    return {
      kind: 'bracket' as const,
      end: startIndex + '\\lbracket'.length
    }
  }

  if (source.startsWith('|', startIndex)) {
    return {
      kind: 'bar' as const,
      end: startIndex + 1
    }
  }

  if (source.startsWith('\\vert', startIndex)) {
    return {
      kind: 'bar' as const,
      end: startIndex + '\\vert'.length
    }
  }

  if (source.startsWith('\\lvert', startIndex)) {
    return {
      kind: 'bar' as const,
      end: startIndex + '\\lvert'.length
    }
  }

  return null
}

function readRightArrayDelimiter(source: string, startIndex: number) {
  if (!source.startsWith('\\right', startIndex)) {
    return null
  }

  const cursor = skipWhitespace(source, startIndex + '\\right'.length)
  if (source[cursor] === '.') {
    return {
      kind: 'null' as const,
      end: cursor + 1
    }
  }

  if (source.startsWith('\\rVert', cursor)) {
    return {
      kind: 'double-bar' as const,
      end: cursor + '\\rVert'.length
    }
  }

  if (source.startsWith('\\Vert', cursor)) {
    return {
      kind: 'double-bar' as const,
      end: cursor + '\\Vert'.length
    }
  }

  if (source.startsWith('\\|', cursor)) {
    return {
      kind: 'double-bar' as const,
      end: cursor + '\\|'.length
    }
  }

  if (source.startsWith('\\}', cursor)) {
    return {
      kind: 'right-brace' as const,
      end: cursor + '\\}'.length
    }
  }

  if (source.startsWith('\\rbrace', cursor)) {
    return {
      kind: 'right-brace' as const,
      end: cursor + '\\rbrace'.length
    }
  }

  if (source.startsWith(')', cursor)) {
    return {
      kind: 'paren' as const,
      end: cursor + 1
    }
  }

  if (source.startsWith('\\rparen', cursor)) {
    return {
      kind: 'paren' as const,
      end: cursor + '\\rparen'.length
    }
  }

  if (source.startsWith(']', cursor)) {
    return {
      kind: 'bracket' as const,
      end: cursor + 1
    }
  }

  if (source.startsWith('\\rbrack', cursor)) {
    return {
      kind: 'bracket' as const,
      end: cursor + '\\rbrack'.length
    }
  }

  if (source.startsWith('\\rbracket', cursor)) {
    return {
      kind: 'bracket' as const,
      end: cursor + '\\rbracket'.length
    }
  }

  if (source.startsWith('|', cursor)) {
    return {
      kind: 'bar' as const,
      end: cursor + 1
    }
  }

  if (source.startsWith('\\vert', cursor)) {
    return {
      kind: 'bar' as const,
      end: cursor + '\\vert'.length
    }
  }

  if (source.startsWith('\\rvert', cursor)) {
    return {
      kind: 'bar' as const,
      end: cursor + '\\rvert'.length
    }
  }

  return null
}

function buildDelimitedArrayRewrite(
  leftDelimiterKind: 'left-brace' | 'paren' | 'bracket' | 'bar' | 'double-bar',
  rightDelimiterKind: 'null' | 'right-brace' | 'paren' | 'bracket' | 'bar' | 'double-bar',
  columnSpec: string,
  arrayBody: string
) {
  if (leftDelimiterKind === 'left-brace' && rightDelimiterKind === 'null' && isCasesCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{cases}${arrayBody}\\end{cases}`
  }

  if (leftDelimiterKind === 'paren' && rightDelimiterKind === 'paren' && hasArrayColumnSeparators(columnSpec)) {
    return wrapArrayInEnvironment('pmatrix', columnSpec, arrayBody)
  }

  if (leftDelimiterKind === 'paren' && rightDelimiterKind === 'paren' && isMatrixCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{pmatrix}${arrayBody}\\end{pmatrix}`
  }

  if (leftDelimiterKind === 'bracket' && rightDelimiterKind === 'bracket' && hasArrayColumnSeparators(columnSpec)) {
    return wrapArrayInEnvironment('bmatrix', columnSpec, arrayBody)
  }

  if (leftDelimiterKind === 'bracket' && rightDelimiterKind === 'bracket' && isMatrixCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{bmatrix}${arrayBody}\\end{bmatrix}`
  }

  if (leftDelimiterKind === 'left-brace' && rightDelimiterKind === 'right-brace' && hasArrayColumnSeparators(columnSpec)) {
    return wrapArrayInEnvironment('Bmatrix', columnSpec, arrayBody)
  }

  if (leftDelimiterKind === 'left-brace' && rightDelimiterKind === 'right-brace' && isMatrixCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{Bmatrix}${arrayBody}\\end{Bmatrix}`
  }

  if (leftDelimiterKind === 'bar' && rightDelimiterKind === 'bar' && hasArrayColumnSeparators(columnSpec)) {
    return wrapArrayInEnvironment('vmatrix', columnSpec, arrayBody)
  }

  if (leftDelimiterKind === 'bar' && rightDelimiterKind === 'bar' && isDeterminantCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{vmatrix}${arrayBody}\\end{vmatrix}`
  }

  if (leftDelimiterKind === 'double-bar' && rightDelimiterKind === 'double-bar' && hasArrayColumnSeparators(columnSpec)) {
    return wrapArrayInEnvironment('Vmatrix', columnSpec, arrayBody)
  }

  if (leftDelimiterKind === 'double-bar' && rightDelimiterKind === 'double-bar' && isMatrixCompatibleArrayColumnSpec(columnSpec)) {
    return `\\begin{Vmatrix}${arrayBody}\\end{Vmatrix}`
  }

  return null
}

function isCasesCompatibleArrayColumnSpec(columnSpec: string) {
  const columns = parseSimpleArrayColumnSpec(columnSpec)
  return columns !== null && columns.length >= 1 && columns.length <= 2
}

function isDeterminantCompatibleArrayColumnSpec(columnSpec: string) {
  const columns = parseSimpleArrayColumnSpec(columnSpec)
  return columns !== null && columns.length >= 1
}

function isMatrixCompatibleArrayColumnSpec(columnSpec: string) {
  const columns = parseSimpleArrayColumnSpec(columnSpec)
  return columns !== null && columns.length >= 1
}

function hasArrayColumnSeparators(columnSpec: string) {
  return parseArrayColumnSpecWithSeparators(columnSpec) !== null
}

function parseSimpleArrayColumnSpec(columnSpec: string) {
  const normalized = columnSpec.replace(/\s+/g, '')
  if (!normalized || /[^lcr]/.test(normalized)) {
    return null
  }

  return [...normalized]
}

function parseArrayColumnSpecWithSeparators(columnSpec: string) {
  const normalized = columnSpec.replace(/\s+/g, '')
  if (!normalized || !normalized.includes('|') || /[^lcr|]/.test(normalized) || /(^\|)|(\|$)|(\|\|)/.test(normalized)) {
    return null
  }

  const columns = normalized.replace(/\|/g, '')
  if (!columns) {
    return null
  }

  return normalized
}

function wrapArrayInEnvironment(environmentName: 'pmatrix' | 'bmatrix' | 'Bmatrix' | 'vmatrix' | 'Vmatrix', columnSpec: string, arrayBody: string) {
  return `\\begin{${environmentName}}\\begin{array}{${columnSpec}}${arrayBody}\\end{array}\\end{${environmentName}}`
}

function readEnvironmentBody(source: string, environmentName: string, startIndex: number) {
  const beginToken = `\\begin{${environmentName}}`
  const endToken = `\\end{${environmentName}}`
  let depth = 1
  let cursor = startIndex

  while (cursor < source.length) {
    const nextBegin = source.indexOf(beginToken, cursor)
    const nextEnd = source.indexOf(endToken, cursor)
    if (nextEnd < 0) {
      return null
    }

    if (nextBegin >= 0 && nextBegin < nextEnd) {
      depth += 1
      cursor = nextBegin + beginToken.length
      if (environmentName === 'array') {
        const nestedColumnSpec = readBalancedGroup(source, cursor)
        if (!nestedColumnSpec) {
          return null
        }
        cursor = nestedColumnSpec.end
      }
      continue
    }

    depth -= 1
    if (depth === 0) {
      return {
        content: source.slice(startIndex, nextEnd),
        end: nextEnd + endToken.length
      }
    }
    cursor = nextEnd + endToken.length
  }

  return null
}

function shouldUseCenteredDots(source: string, commandIndex: number, commandLength: number) {
  const previousToken = readPreviousLatexToken(source, commandIndex)
  const nextToken = readNextLatexToken(source, commandIndex + commandLength)
  return isCenteredDotsNeighbor(previousToken) || isCenteredDotsNeighbor(nextToken)
}

function isCenteredDotsNeighbor(token: string | null) {
  if (!token) {
    return false
  }

  return centeredDotsOperatorChars.has(token) || centeredDotsOperatorCommands.has(token)
}

function readPreviousLatexToken(source: string, startIndex: number) {
  let cursor = startIndex - 1
  while (cursor >= 0 && /\s/.test(source[cursor])) {
    cursor -= 1
  }
  if (cursor < 0) {
    return null
  }

  const character = source[cursor]
  if (centeredDotsOperatorChars.has(character)) {
    return character
  }
  if (character === '}' || character === ')' || character === ']' || /[0-9A-Za-z]/.test(character)) {
    if (!/[A-Za-z]/.test(character)) {
      return 'atom'
    }

    let nameStart = cursor
    while (nameStart - 1 >= 0 && isAsciiLetter(source[nameStart - 1])) {
      nameStart -= 1
    }
    if (nameStart - 1 >= 0 && source[nameStart - 1] === '\\') {
      return source.slice(nameStart - 1, cursor + 1)
    }
    return 'atom'
  }
  if (character === '\\') {
    return source.slice(cursor, cursor + 2)
  }

  return character
}

function readNextLatexToken(source: string, startIndex: number) {
  let cursor = startIndex
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  if (cursor >= source.length) {
    return null
  }

  const character = source[cursor]
  if (centeredDotsOperatorChars.has(character)) {
    return character
  }
  if (character === '\\') {
    const nextCharacter = source[cursor + 1] ?? ''
    if (!isAsciiLetter(nextCharacter)) {
      return source.slice(cursor, cursor + 2)
    }

    let commandEnd = cursor + 1
    while (commandEnd < source.length && isAsciiLetter(source[commandEnd])) {
      commandEnd += 1
    }
    return source.slice(cursor, commandEnd)
  }
  if (character === '{' || character === '(' || character === '[' || /[0-9A-Za-z]/.test(character)) {
    return 'atom'
  }

  return character
}

function readBalancedGroup(source: string, startIndex: number) {
  let cursor = startIndex
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  if (source[cursor] !== '{') {
    return null
  }

  let depth = 0
  for (let index = cursor; index < source.length; index += 1) {
    const character = source[index]
    if (character === '{' && !isEscaped(source, index)) {
      depth += 1
      continue
    }
    if (character === '}' && !isEscaped(source, index)) {
      depth -= 1
      if (depth === 0) {
        return {
          content: source.slice(cursor + 1, index),
          end: index + 1
        }
      }
    }
  }

  return null
}

function skipWhitespace(source: string, startIndex: number) {
  let cursor = startIndex
  while (cursor < source.length && /\s/.test(source[cursor])) {
    cursor += 1
  }
  return cursor
}

function isEscaped(source: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }
  return slashCount % 2 === 1
}

function isAsciiLetter(value: string) {
  return /^[A-Za-z]$/.test(value)
}
