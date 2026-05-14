import { memo, useMemo, type Key, type ReactNode } from 'react'
import { renderToString } from 'katex'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { markdownToPlainText } from '../../src_original_reference/lib/text'
import type { AskAction, DocumentNode } from '../../src_original_reference/types/domain'
import { katexDelimiters, katexDisplayAttribute, katexOptions, katexSourceAttribute } from './katexConfig'

export interface MarkdownHighlight {
  id: string
  text: string
  color: string
  startOffset?: number
  endOffset?: number
  contextPrefix?: string
  contextSuffix?: string
}

export function titleForDocument(document: DocumentNode) {
  return document.title.trim() || document.path.split('/').pop()?.replace(/\.md$/i, '') || document.path
}

export function markdownBlocks(markdown: string, documentPath?: string, highlights: MarkdownHighlight[] = []) {
  return <MarkdownHtml markdown={markdown} documentPath={documentPath} highlights={highlights} />
}

function withFallbackTitle(markdown: string, documentPath?: string) {
  if (/^#\s+\S/m.test(markdown)) return markdown
  const filename = documentPath?.split('/').pop()?.replace(/\.md$/i, '').trim()
  return filename ? `# ${filename}\n\n${markdown}` : markdown
}

const MarkdownHtml = memo(function MarkdownHtml({
  markdown,
  documentPath,
  highlights
}: {
  markdown: string
  documentPath?: string
  highlights: MarkdownHighlight[]
}) {
  const html = useMemo(() => renderMarkdownHtml(markdown, documentPath, highlights), [markdown, documentPath, highlights])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
})

function renderMarkdownHtml(markdown: string, documentPath?: string, highlights: MarkdownHighlight[] = []) {
  const marked = markMarkdownSource(markdown, highlights)
  const displayMarkdown = withFallbackTitle(marked.markdown, documentPath)
  const mathSlots: string[] = []
  let formulaIndex = 0
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype, {
        handlers: {
          math(_state: unknown, node: { value?: string }) {
            const index = mathSlots.push(renderMathHtml(node.value ?? '', true, marked.formulas[formulaIndex++])) - 1
            return { type: 'element', tagName: 'anyreader-katex', properties: { 'data-index': String(index) }, children: [] }
          },
          inlineMath(_state: unknown, node: { value?: string }) {
            const index = mathSlots.push(renderMathHtml(node.value ?? '', false, marked.formulas[formulaIndex++])) - 1
            return { type: 'element', tagName: 'anyreader-katex', properties: { 'data-index': String(index) }, children: [] }
          }
        }
      })
      .use(rehypeStringify)
      .processSync(displayMarkdown)
  )

  const resolvedHtml = mathSlots.reduce(
    (nextHtml, slot, index) =>
      nextHtml.replaceAll(`<anyreader-katex data-index="${index}"></anyreader-katex>`, slot),
    html
  ).replace(/(<img\b[^>]*\bsrc=")([^"]*)(")/g, (_match, prefix: string, src: string, suffix: string) =>
    `${prefix}${escapeHtmlAttribute(resolveAssetPath(documentPath, src))}${suffix}`
  )
  return marked.markers.reduce(
    (nextHtml, marker) =>
      nextHtml
        .replaceAll(marker.startToken, `<mark class="qa-source-highlight" data-qa-record-id="${escapeHtmlAttribute(marker.id)}" style="--qa-highlight-color: ${safeCssColor(marker.color)}">`)
        .replaceAll(marker.endToken, '</mark>'),
    resolvedHtml
  )
}

export function renderInlineMath(text: string, keyPrefix: string) {
  const nodes: ReactNode[] = []
  let cursor = 0
  let nodeIndex = 0

  while (cursor < text.length) {
    const start = findNextInlineDelimiter(text, cursor)
    if (!start) {
      nodes.push(text.slice(cursor))
      break
    }

    if (start.index > cursor) {
      nodes.push(text.slice(cursor, start.index))
    }

    const latexStart = start.index + start.left.length
    const end = findClosingDelimiter(text, latexStart, start.right)
    if (end < 0) {
      nodes.push(text.slice(start.index))
      break
    }

    nodes.push(renderMath(text.slice(latexStart, end), false, `${keyPrefix}-${nodeIndex++}`))
    cursor = end + start.right.length
  }

  return nodes
}

function findNextInlineDelimiter(text: string, from: number) {
  let found: { index: number; left: string; right: string } | null = null
  for (const delimiter of katexDelimiters) {
    if (delimiter.display) continue
    let index = text.indexOf(delimiter.left, from)
    while (index >= 0 && (isEscaped(text, index) || isDoubleDollar(text, index, delimiter.left))) {
      index = text.indexOf(delimiter.left, index + delimiter.left.length)
    }
    if (index >= 0 && (!found || index < found.index)) {
      found = { index, left: delimiter.left, right: delimiter.right }
    }
  }
  return found
}

function findClosingDelimiter(text: string, from: number, delimiter: string) {
  let index = text.indexOf(delimiter, from)
  while (index >= 0 && (isEscaped(text, index) || isDoubleDollar(text, index, delimiter))) {
    index = text.indexOf(delimiter, index + delimiter.length)
  }
  return index
}

function isEscaped(text: string, index: number) {
  let count = 0
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor -= 1) {
    count += 1
  }
  return count % 2 === 1
}

function isDoubleDollar(text: string, index: number, delimiter: string) {
  return delimiter === '$' && (text[index - 1] === '$' || text[index + 1] === '$')
}

function renderMath(latex: string, displayMode: boolean, key: Key) {
  const sourceProps = {
    [katexSourceAttribute]: latex,
    [katexDisplayAttribute]: displayMode ? 'true' : 'false'
  }
  try {
    const html = renderToString(latex, { ...katexOptions, displayMode })
    return displayMode
      ? <div className="math-block" dangerouslySetInnerHTML={{ __html: html }} key={key} {...sourceProps} />
      : <span className="math-inline" dangerouslySetInnerHTML={{ __html: html }} key={key} {...sourceProps} />
  } catch {
    return displayMode
      ? <pre className="math-block" key={key} {...sourceProps}>{latex}</pre>
      : <code className="math-inline" key={key} {...sourceProps}>{latex}</code>
  }
}

function renderMathHtml(latex: string, displayMode: boolean, highlight?: FormulaRange) {
  const sourceAttrs = `${katexSourceAttribute}="${escapeHtmlAttribute(latex)}" ${katexDisplayAttribute}="${displayMode ? 'true' : 'false'}"`
  const tag = displayMode ? 'div' : 'span'
  const highlighted = highlight?.id && highlight.color ? highlight : null
  const className = `${displayMode ? 'math-block' : 'math-inline'}${highlighted ? ' qa-source-highlight' : ''}`
  const highlightAttrs = highlighted
    ? ` data-qa-record-id="${escapeHtmlAttribute(highlighted.id!)}" style="--qa-highlight-color: ${safeCssColor(highlighted.color!)}"`
    : ''
  try {
    return `<${tag} class="${className}" ${sourceAttrs}${highlightAttrs}>${renderToString(latex, { ...katexOptions, displayMode })}</${tag}>`
  } catch {
    return `<${tag} class="${className}" ${sourceAttrs}${highlightAttrs}>${escapeHtml(latex)}</${tag}>`
  }
}

function resolveAssetPath(documentPath: string | undefined, raw: string) {
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  const base = documentPath ? documentPath.split('/').slice(0, -1) : []
  const output: string[] = []
  for (const part of [...base, ...raw.split('/')]) {
    if (!part || part === '.') continue
    if (part === '..') output.pop()
    else output.push(part)
  }
  return `/vault/${output.map(encodeURIComponent).join('/')}`
}

function escapeHtml(input: string) {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function escapeHtmlAttribute(input: string) {
  return escapeHtml(input).replace(/"/g, '&quot;')
}

type MappedChar = { ch: string; source: number }
type SourceRange = { id: string; color: string; start: number; end: number }
type FormulaRange = { start: number; end: number; id?: string; color?: string }

function markMarkdownSource(markdown: string, highlights: MarkdownHighlight[]) {
  const map = plainMapForMarkdown(markdown)
  const formulas = mathSourceRanges(markdown)
  if (!highlights.length) return { markdown, formulas, markers: [] as Array<SourceRange & { startToken: string; endToken: string }> }
  const ranges = highlights
    .flatMap((highlight) => sourceRangesForHighlight(markdown, map, highlight))
    .sort((left, right) => left.start - right.start)
  ranges.forEach((range) => markFormulaHits(range, formulas))
  const textRanges = ranges
    .flatMap((range) => removeFormulaParts(markdown, range, formulas))
    .filter((range, index, ranges) => index === 0 || range.start >= ranges[index - 1].end)

  const markers = textRanges.map((range, index) => ({
    ...range,
    startToken: `§ARHL${index}S§`,
    endToken: `§ARHL${index}E§`
  }))
  const nextMarkdown = markers
    .slice()
    .reverse()
    .reduce((text, marker) => `${text.slice(0, marker.start)}${marker.startToken}${text.slice(marker.start, marker.end)}${marker.endToken}${text.slice(marker.end)}`, markdown)

  return { markdown: nextMarkdown, formulas, markers }
}

function sourceRangesForHighlight(markdown: string, map: { text: string; chars: MappedChar[] }, highlight: MarkdownHighlight) {
  const fromPlain = plainRangeForHighlight(map.text, highlight)
  const ranges = fromPlain ? sourceRangesFromPlain(map.chars, fromPlain.start, fromPlain.end, highlight) : []
  if (!ranges.length) {
    const direct = directSourceRange(markdown, highlight)
    if (direct) ranges.push(direct)
  }
  return mergeSourceRanges(ranges)
}

function sourceRangesFromPlain(chars: MappedChar[], start: number, end: number, highlight: MarkdownHighlight) {
  const ranges: SourceRange[] = []
  chars
    .slice(start, end)
    .map((item) => item.source)
    .filter((source) => source >= 0)
    .sort((left, right) => left - right)
    .forEach((source) => {
      const last = ranges[ranges.length - 1]
      if (last && source === last.end) last.end = source + 1
      else ranges.push({ id: highlight.id, color: highlight.color, start: source, end: source + 1 })
    })
  return ranges
}

function plainRangeForHighlight(plainText: string, highlight: MarkdownHighlight) {
  const candidates = textCandidates(highlight.text)
  if (!candidates.length) return null
  if (
    typeof highlight.startOffset === 'number' &&
    typeof highlight.endOffset === 'number' &&
    candidates.includes(plainText.slice(highlight.startOffset, highlight.endOffset).trim())
  ) {
    return { start: highlight.startOffset, end: highlight.endOffset }
  }

  const match = findPlainMatch(plainText, candidates, highlight)
  return match.start >= 0 ? { start: match.start, end: match.start + match.text.length } : null
}

function findPlainMatch(plainText: string, candidates: string[], highlight: MarkdownHighlight) {
  const prefixes = textCandidates(highlight.contextPrefix ?? '').map((text) => text.slice(-80))
  for (const prefix of prefixes) {
    const prefixIndex = plainText.indexOf(prefix)
    const match = prefixIndex >= 0 ? firstCandidateIndex(plainText, candidates, prefixIndex + prefix.length) : null
    if (match) return match
  }

  const suffixes = textCandidates(highlight.contextSuffix ?? '').map((text) => text.slice(0, 80))
  for (const suffix of suffixes) {
    const suffixIndex = plainText.indexOf(suffix)
    const match = suffixIndex >= 0 ? lastCandidateIndex(plainText, candidates, suffixIndex) : null
    if (match) return match
  }

  return firstCandidateIndex(plainText, candidates, 0) ?? { start: -1, text: '' }
}

function directSourceRange(markdown: string, highlight: MarkdownHighlight): SourceRange | null {
  for (const text of textCandidates(highlight.text)) {
    const start = markdown.indexOf(text)
    if (start >= 0) return { id: highlight.id, color: highlight.color, start, end: start + text.length }
  }
  return null
}

function textCandidates(input: string) {
  const normalized = normalizeSearchText(input)
  return [...new Set([normalized, normalizeSearchText(markdownToPlainText(input))].filter(Boolean))]
}

function firstCandidateIndex(text: string, candidates: string[], from: number) {
  return candidates.reduce<{ start: number; text: string } | null>((best, candidate) => {
    const start = text.indexOf(candidate, from)
    return start >= 0 && (!best || start < best.start) ? { start, text: candidate } : best
  }, null)
}

function lastCandidateIndex(text: string, candidates: string[], before: number) {
  return candidates.reduce<{ start: number; text: string } | null>((best, candidate) => {
    const start = text.lastIndexOf(candidate, before)
    return start >= 0 && (!best || start > best.start) ? { start, text: candidate } : best
  }, null)
}

function mergeSourceRanges(ranges: SourceRange[]) {
  return ranges
    .sort((left, right) => left.start - right.start)
    .reduce<SourceRange[]>((merged, range) => {
      const last = merged[merged.length - 1]
      if (last && last.id === range.id && last.color === range.color && range.start <= last.end) last.end = Math.max(last.end, range.end)
      else merged.push({ ...range })
      return merged
    }, [])
}

function markFormulaHits(range: SourceRange, formulas: FormulaRange[]) {
  formulas.forEach((formula) => {
    if (range.start < formula.end && range.end > formula.start) {
      formula.id = range.id
      formula.color = range.color
    }
  })
}

function removeFormulaParts(markdown: string, range: SourceRange, formulas: FormulaRange[]) {
  const pieces: SourceRange[] = []
  let cursor = range.start
  formulas.filter((formula) => range.start < formula.end && range.end > formula.start).forEach((formula) => {
    pieces.push(trimRange(markdown, { ...range, start: cursor, end: Math.min(range.end, formula.start) }))
    cursor = Math.max(cursor, formula.end)
  })
  pieces.push(trimRange(markdown, { ...range, start: cursor, end: range.end }))
  return pieces.filter((piece) => piece.start < piece.end)
}

function trimRange(markdown: string, range: SourceRange) {
  while (range.start < range.end && /\s/.test(markdown[range.start])) range.start += 1
  while (range.end > range.start && /\s/.test(markdown[range.end - 1])) range.end -= 1
  return range
}

function mathSourceRanges(markdown: string) {
  const ranges: FormulaRange[] = []
  for (const delimiter of katexDelimiters) {
    let start = markdown.indexOf(delimiter.left)
    while (start >= 0) {
      if (isEscaped(markdown, start) || isDoubleDollar(markdown, start, delimiter.left)) {
        start = markdown.indexOf(delimiter.left, start + delimiter.left.length)
        continue
      }
      const contentStart = start + delimiter.left.length
      const end = findClosingDelimiter(markdown, contentStart, delimiter.right)
      if (end < 0) break
      ranges.push({ start, end: end + delimiter.right.length })
      start = markdown.indexOf(delimiter.left, end + delimiter.right.length)
    }
  }
  return ranges.sort((left, right) => left.start - right.start)
}

function plainMapForMarkdown(markdown: string) {
  let chars = formulaMappedChars(markdown)
  chars = replaceMapped(chars, /```[\s\S]*?```/g, (match) => [{ ch: ' ', source: match.index }])
  chars = replaceMapped(chars, /`([^`]+)`/g, (match) => groupChars(chars, match, 1))
  chars = replaceMapped(chars, /!\[[^\]]*]\([^)]*\)/g, (match) => [{ ch: ' ', source: match.index }])
  chars = replaceMapped(chars, /\[([^\]]+)]\([^)]*\)/g, (match) => groupChars(chars, match, 1))
  chars = replaceMapped(chars, /^>\s?/gm, () => [])
  chars = replaceMapped(chars, /^#{1,6}\s+/gm, () => [])
  chars = replaceMapped(chars, /[*_~]/g, () => [])
  chars = replaceMapped(chars, /^\s*[-+]\s+/gm, () => [])
  chars = replaceMapped(chars, /^\s*\d+\.\s+/gm, () => [])
  chars = replaceMapped(chars, /\n{3,}/g, (match) => [
    { ch: '\n', source: match.index },
    { ch: '\n', source: match.index + 1 }
  ])
  chars = chars.filter((item) => !/\s/.test(item.ch))
  return { text: chars.map((item) => item.ch).join(''), chars }
}

function formulaMappedChars(markdown: string) {
  const formulas = mathSourceRanges(markdown)
  const chars: MappedChar[] = []
  let cursor = 0
  formulas.forEach((formula) => {
    chars.push(...[...markdown.slice(cursor, formula.start)].map((ch, index) => ({ ch, source: cursor + index })))
    chars.push(...[...formulaSearchText(markdown.slice(formula.start, formula.end))].map((ch) => ({ ch, source: formula.start })))
    cursor = formula.end
  })
  chars.push(...[...markdown.slice(cursor)].map((ch, index) => ({ ch, source: cursor + index })))
  return chars
}

function formulaSearchText(source: string) {
  const delimiter = katexDelimiters.find((item) => source.startsWith(item.left) && source.endsWith(item.right))
  if (!delimiter) return source
  const latex = source.slice(delimiter.left.length, source.length - delimiter.right.length).trim()
  return delimiter.display ? `$$${latex}$$` : `$${latex}$`
}

function normalizeSearchText(input: string) {
  return formulaMappedChars(input).map((item) => item.ch).join('').replace(/\s+/g, '').trim()
}

function replaceMapped(chars: MappedChar[], regex: RegExp, replacement: (match: RegExpExecArray) => MappedChar[]) {
  const text = chars.map((item) => item.ch).join('')
  const next: MappedChar[] = []
  let cursor = 0
  for (const match of text.matchAll(regex)) {
    next.push(...chars.slice(cursor, match.index))
    next.push(...replacement(match))
    cursor = (match.index ?? 0) + match[0].length
  }
  next.push(...chars.slice(cursor))
  return next
}

function groupChars(chars: MappedChar[], match: RegExpExecArray, groupIndex: number) {
  const value = match[groupIndex] ?? ''
  const offset = match[0].indexOf(value)
  const start = (match.index ?? 0) + offset
  return chars.slice(start, start + value.length)
}

function safeCssColor(color: string) {
  return /^#[\da-f]{3,8}$/i.test(color) ? color : '#569cd6'
}

export function plainContextForDocument(document: DocumentNode) {
  return document.contentPlainText || markdownToPlainText(document.contentMd)
}

export function displayAnswerMarkdown(markdown: string) {
  return markdown.replace(/^##\s*问题\s*\n+/, '')
}

export function selectionAction(args: {
  eventPoint: { x: number; y: number }
  surface: AskAction['surface']
  target: AskAction['target']
  surfaceTitle: string
  surfaceText: string
  sourceQaRecordId?: string
}): AskAction | null {
  const selection = window.getSelection()
  if (!selection) return null
  if (selection.isCollapsed) return null
  const text = selectedTextWithKatexSource(selection)
  if (!text) return null
  const content = args.surfaceText
  const startOffset = content.indexOf(text)
  const endOffset = startOffset >= 0 ? startOffset + text.length : undefined
  const radius = 180
  return {
    surface: args.surface,
    target: args.target,
    surfaceTitle: args.surfaceTitle,
    sourceQaRecordId: args.sourceQaRecordId,
    selection: {
      text,
      kind: 'plain',
      startOffset: startOffset >= 0 ? startOffset : undefined,
      endOffset,
      surfaceText: content,
      contextPrefix: startOffset >= 0 ? content.slice(Math.max(0, startOffset - radius), startOffset) : undefined,
      contextSuffix: endOffset !== undefined ? content.slice(endOffset, endOffset + radius) : undefined,
      anchorQuote: text
    },
    menuPoint: args.eventPoint
  }
}

function selectedTextWithKatexSource(selection: Selection) {
  if (selection.rangeCount === 0) return ''
  const range = selection.getRangeAt(0)
  const mathSelector = `[${katexSourceAttribute}]`
  const commonElement =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  const enclosingMath = commonElement?.closest(mathSelector)

  if (enclosingMath) return katexSourceText(enclosingMath)

  const fragment = range.cloneContents()
  fragment.querySelectorAll(mathSelector).forEach((element) => {
    element.textContent = katexSourceText(element)
  })
  return fragment.textContent?.trim() || selection.toString().trim()
}

function katexSourceText(element: Element) {
  const latex = element.getAttribute(katexSourceAttribute)?.trim() ?? ''
  return element.getAttribute(katexDisplayAttribute) === 'true' ? `$$${latex}$$` : `$${latex}$`
}
