import type { Key, ReactNode } from 'react'
import { renderToString } from 'katex'
import { markdownToPlainText } from '../../src_original_reference/lib/text'
import type { AskAction, DocumentNode } from '../../src_original_reference/types/domain'
import { katexDelimiters, katexDisplayAttribute, katexOptions, katexSourceAttribute } from './katexConfig'

export function titleForDocument(document: DocumentNode) {
  return document.title.trim() || document.path.split('/').pop()?.replace(/\.md$/i, '') || document.path
}

export function markdownBlocks(markdown: string, documentPath?: string) {
  const chunks = markdown.split(/\n{2,}/)
  return chunks.map((raw, index) => {
    const block = raw.trim()
    if (!block) return null
    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*(.*)$/s)
    if (image) {
      return (
        <figure className="markdown-figure" key={index}>
          <img src={resolveAssetPath(documentPath, image[2])} alt={image[1]} />
          {image[3].trim() ? <figcaption>{renderInlineMath(image[3].trim(), `caption-${index}`)}</figcaption> : null}
        </figure>
      )
    }
    const mathBlock = parseBlockMath(block)
    if (mathBlock) {
      return renderMath(mathBlock.latex, true, index)
    }
    if (/^#{1,6}\s/.test(block)) {
      const text = block.replace(/^#{1,6}\s*/, '')
      if (block.startsWith('# ')) return <h1 key={index}>{renderInlineMath(text, `h1-${index}`)}</h1>
      if (block.startsWith('## ')) return <h2 key={index}>{renderInlineMath(text, `h2-${index}`)}</h2>
      return <h3 key={index}>{renderInlineMath(text, `h3-${index}`)}</h3>
    }
    if (/^[-*]\s/m.test(block)) {
      return (
        <ul key={index}>
          {block.split(/\n/).map((line, itemIndex) => (
            <li key={itemIndex}>{renderInlineMath(line.replace(/^[-*]\s*/, ''), `li-${index}-${itemIndex}`)}</li>
          ))}
        </ul>
      )
    }
    return <p key={index}>{renderInlineMath(block, `p-${index}`)}</p>
  })
}

function parseBlockMath(block: string) {
  for (const delimiter of katexDelimiters) {
    if (!delimiter.display) continue
    if (block.startsWith(delimiter.left) && block.endsWith(delimiter.right)) {
      return {
        latex: block.slice(delimiter.left.length, block.length - delimiter.right.length).trim()
      }
    }
  }
  return null
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
