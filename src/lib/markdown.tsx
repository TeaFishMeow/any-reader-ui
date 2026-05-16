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
  color: string
  anchorFrom?: number
  anchorTo?: number
  quote?: string
}

export function titleForDocument(document: DocumentNode) {
  return document.title.trim() || document.path.split('/').pop()?.replace(/\.md$/i, '') || document.path
}

export function markdownBlocks(markdown: string, documentPath?: string, highlights: MarkdownHighlight[] = []) {
  return <MarkdownHtml markdown={markdown} documentPath={documentPath} highlights={highlights} />
}

export function markedRecordIdFromTarget(target: EventTarget | null) {
  return target instanceof Element
    ? target.closest<HTMLElement>('[data-qa-record-id]')?.dataset.qaRecordId
    : undefined
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
  const marked = markMarkdownSource(withFallbackTitle(markdown, documentPath), highlights)
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
      .processSync(marked.markdown)
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
type MarkdownNode = {
  type: string
  value?: string
  children?: MarkdownNode[]
  position?: {
    start?: { offset?: number }
    end?: { offset?: number }
  }
}

function markMarkdownSource(markdown: string, highlights: MarkdownHighlight[]) {
  const map = markdownSourceMap(markdown)
  const formulas = map.formulas
  if (!highlights.length) return { markdown, formulas, markers: [] as Array<SourceRange & { startToken: string; endToken: string }> }
  const textRanges = highlights
    .flatMap((highlight) => sourceRangesForHighlight(markdown, map, highlight))
    .sort((left, right) => left.start - right.start)
    .flatMap((range) => splitFormulaRanges(markdown, range, formulas))
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

function sourceRangesForHighlight(_markdown: string, map: { text: string; chars: MappedChar[] }, highlight: MarkdownHighlight) {
  const anchor = anchoredPlainRange(map.text, highlight)
  return anchor ? mergeSourceRanges(sourceRangesFromPlain(map.chars, anchor.start, anchor.end, highlight)) : []
}

function anchoredPlainRange(plainText: string, highlight: MarkdownHighlight) {
  if (typeof highlight.anchorFrom !== 'number' || typeof highlight.anchorTo !== 'number') return null
  if (highlight.anchorFrom < 0 || highlight.anchorTo <= highlight.anchorFrom || highlight.anchorTo > plainText.length) return null
  return { start: highlight.anchorFrom, end: highlight.anchorTo }
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

function splitFormulaRanges(markdown: string, range: SourceRange, formulas: FormulaRange[]) {
  const pieces: SourceRange[] = []
  let cursor = range.start
  formulas.forEach((formula) => {
    if (range.start >= formula.end || range.end <= formula.start) return
    formula.id = range.id
    formula.color = range.color
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

function markdownSourceMap(markdown: string) {
  const chars: MappedChar[] = []
  const formulas: FormulaRange[] = []
  walkMarkdown(unified().use(remarkParse).use(remarkGfm).use(remarkMath).parse(markdown) as MarkdownNode, (node) => {
    if (node.type === 'text' || node.type === 'inlineCode') chars.push(...mappedNodeValue(markdown, node))
    if (node.type === 'code') chars.push(...mappedCodeValue(markdown, node))
    if (node.type === 'math' || node.type === 'inlineMath') {
      const range = nodeRange(node)
      if (!range) return
      formulas.push(range)
      chars.push(...[...formulaSearchText(node.value ?? '', node.type === 'math')].map((ch) => ({ ch, source: range.start })))
    }
  })
  const visibleChars = chars.filter((item) => !/\s/.test(item.ch))
  return { text: visibleChars.map((item) => item.ch).join(''), chars: visibleChars, formulas }
}

function walkMarkdown(node: MarkdownNode, visit: (node: MarkdownNode) => void) {
  visit(node)
  node.children?.forEach((child) => walkMarkdown(child, visit))
}

function nodeRange(node: MarkdownNode): FormulaRange | null {
  const start = node.position?.start?.offset
  const end = node.position?.end?.offset
  return typeof start === 'number' && typeof end === 'number' ? { start, end } : null
}

function mappedNodeValue(markdown: string, node: MarkdownNode) {
  const value = node.value ?? ''
  const range = nodeRange(node)
  if (!range || !value) return []
  return mappedValueInChars(value, [...markdown.slice(range.start, range.end)].map((ch, index) => ({ ch, source: range.start + index })))
}

function mappedCodeValue(markdown: string, node: MarkdownNode) {
  const value = node.value ?? ''
  const range = nodeRange(node)
  if (!range || !value) return []
  const chars: MappedChar[] = []
  let offset = range.start
  for (const line of markdown.slice(range.start, range.end).match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!line) continue
    const quotePrefix = line.match(/^[ \t]*>\s?/)?.[0] ?? ''
    const body = line.slice(quotePrefix.length)
    const fence = body.trimStart().startsWith('```') || body.trimStart().startsWith('~~~')
    if (!fence) {
      chars.push(...[...body].map((ch, index) => ({ ch, source: offset + quotePrefix.length + index })))
    }
    offset += line.length
  }
  return mappedValueInChars(value, chars)
}

function mappedValueInChars(value: string, chars: MappedChar[]) {
  const mapped: MappedChar[] = []
  let cursor = 0
  for (const ch of value) {
    const index = chars.findIndex((item, itemIndex) => itemIndex >= cursor && item.ch === ch)
    if (index < 0) continue
    mapped.push(chars[index])
    cursor = index + 1
  }
  return mapped
}

function formulaSearchText(latex: string, display: boolean) {
  const normalized = latex.trim()
  return display ? `$$${normalized}$$` : `$${normalized}$`
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
  const anchor = selectionAnchor(selection)
  const content = args.surfaceText
  return {
    surface: args.surface,
    target: args.target,
    surfaceTitle: args.surfaceTitle,
    sourceQaRecordId: args.sourceQaRecordId,
    selection: {
      text,
      kind: 'plain',
      anchorFrom: anchor?.from,
      anchorTo: anchor?.to,
      surfaceText: content,
      anchorQuote: text
    },
    menuPoint: args.eventPoint
  }
}

function selectionAnchor(selection: Selection) {
  if (selection.rangeCount === 0) return null
  const range = selection.getRangeAt(0)
  const commonElement =
    range.commonAncestorContainer instanceof Element
      ? range.commonAncestorContainer
      : range.commonAncestorContainer.parentElement
  const root = commonElement?.closest('.markdown-body')
  if (!root) return null
  const selectedRange = range.cloneRange()
  const startMath = closestMathElement(selectedRange.startContainer)
  const endMath = closestMathElement(selectedRange.endContainer)
  if (startMath) selectedRange.setStartBefore(startMath)
  if (endMath) selectedRange.setEndAfter(endMath)

  const before = document.createRange()
  before.setStart(root, 0)
  before.setEnd(selectedRange.startContainer, selectedRange.startOffset)
  const from = normalizedFragmentText(before.cloneContents()).length
  const to = from + normalizedFragmentText(selectedRange.cloneContents()).length
  return to > from ? { from, to } : null
}

function closestMathElement(node: Node) {
  const element = node instanceof Element ? node : node.parentElement
  return element?.closest(`[${katexSourceAttribute}]`) ?? null
}

function normalizedFragmentText(fragment: DocumentFragment) {
  fragment.querySelectorAll(`[${katexSourceAttribute}]`).forEach((element) => {
    element.textContent = katexSourceText(element)
  })
  return (fragment.textContent ?? '').replace(/\s+/g, '')
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
