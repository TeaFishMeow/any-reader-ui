import { markdownToPlainText } from '../../src_original_reference/lib/text'
import type { AskAction, DocumentNode } from '../../src_original_reference/types/domain'

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
          {image[3].trim() ? <figcaption>{image[3].trim()}</figcaption> : null}
        </figure>
      )
    }
    if (/^#{1,6}\s/.test(block)) {
      const text = block.replace(/^#{1,6}\s*/, '')
      if (block.startsWith('# ')) return <h1 key={index}>{text}</h1>
      if (block.startsWith('## ')) return <h2 key={index}>{text}</h2>
      return <h3 key={index}>{text}</h3>
    }
    if (/^\$\$[\s\S]*\$\$$/.test(block)) {
      return <pre className="math-block" key={index}>{block.replace(/^\$\$|\$\$$/g, '').trim()}</pre>
    }
    if (/^[-*]\s/m.test(block)) {
      return (
        <ul key={index}>
          {block.split(/\n/).map((line, itemIndex) => <li key={itemIndex}>{line.replace(/^[-*]\s*/, '')}</li>)}
        </ul>
      )
    }
    return <p key={index}>{block}</p>
  })
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
  const text = selection?.toString().trim()
  if (!selection || !text) return null
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
