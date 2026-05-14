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

export function titleForDocument(document: DocumentNode) {
  return document.title.trim() || document.path.split('/').pop()?.replace(/\.md$/i, '') || document.path
}

export function markdownBlocks(markdown: string, documentPath?: string) {
  return <MarkdownHtml markdown={withFallbackTitle(markdown, documentPath)} documentPath={documentPath} />
}

function withFallbackTitle(markdown: string, documentPath?: string) {
  if (/^#\s+\S/m.test(markdown)) return markdown
  const filename = documentPath?.split('/').pop()?.replace(/\.md$/i, '').trim()
  return filename ? `# ${filename}\n\n${markdown}` : markdown
}

const MarkdownHtml = memo(function MarkdownHtml({
  markdown,
  documentPath
}: {
  markdown: string
  documentPath?: string
}) {
  const html = useMemo(() => renderMarkdownHtml(markdown, documentPath), [markdown, documentPath])
  return <div dangerouslySetInnerHTML={{ __html: html }} />
})

function renderMarkdownHtml(markdown: string, documentPath?: string) {
  const mathSlots: string[] = []
  const html = String(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath)
      .use(remarkRehype, {
        handlers: {
          math(_state: unknown, node: { value?: string }) {
            const index = mathSlots.push(renderMathHtml(node.value ?? '', true)) - 1
            return { type: 'element', tagName: 'anyreader-katex', properties: { 'data-index': String(index) }, children: [] }
          },
          inlineMath(_state: unknown, node: { value?: string }) {
            const index = mathSlots.push(renderMathHtml(node.value ?? '', false)) - 1
            return { type: 'element', tagName: 'anyreader-katex', properties: { 'data-index': String(index) }, children: [] }
          }
        }
      })
      .use(rehypeStringify)
      .processSync(markdown)
  )

  return mathSlots.reduce(
    (nextHtml, slot, index) =>
      nextHtml.replaceAll(`<anyreader-katex data-index="${index}"></anyreader-katex>`, slot),
    html
  ).replace(/(<img\b[^>]*\bsrc=")([^"]*)(")/g, (_match, prefix: string, src: string, suffix: string) =>
    `${prefix}${escapeHtmlAttribute(resolveAssetPath(documentPath, src))}${suffix}`
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

function renderMathHtml(latex: string, displayMode: boolean) {
  const sourceAttrs = `${katexSourceAttribute}="${escapeHtmlAttribute(latex)}" ${katexDisplayAttribute}="${displayMode ? 'true' : 'false'}"`
  const tag = displayMode ? 'div' : 'span'
  const className = displayMode ? 'math-block' : 'math-inline'
  try {
    return `<${tag} class="${className}" ${sourceAttrs}>${renderToString(latex, { ...katexOptions, displayMode })}</${tag}>`
  } catch {
    return `<${tag} class="${className}" ${sourceAttrs}>${escapeHtml(latex)}</${tag}>`
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
