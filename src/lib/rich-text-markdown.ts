import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import remarkRehype from 'remark-rehype'
import rehypeStringify from 'rehype-stringify'
import { resolveRemoteAsset, type RemoteResolvedAsset } from './api'
import { hashString } from './text'
import { dirnameVaultPath, joinVaultPath, normalizeVaultPath, stripMarkdownExtension } from './vault-paths'
import type { DocumentNode } from '../types/domain'

const OBSIDIAN_WIKI_PROTOCOL = 'anyreader-wiki://'
const mountedAssetUrlCache = new Map<string, Promise<string | null>>()
const remoteAssetUrlCache = new Map<string, Promise<string | null>>()
const remoteAssetUrlValueCache = new Map<string, { signedUrl: string; expiresAt: number }>()
let mountedVaultFsPromise: Promise<typeof import('./fs')> | null = null

interface DocumentLookup {
  byPath: Map<string, string>
  byPathWithoutExtension: Map<string, string>
  byTitle: Map<string, string>
  byBaseName: Map<string, string>
}

export interface RichTextBlock {
  path: string
  title?: string
  markdown: string
}

export function normalizeMarkdownForRichText(source: string) {
  return source
    .replace(/!\[\[([^[\]]+)\]\]/g, (_match, rawTarget: string) => {
      const { target, label } = parseObsidianTarget(rawTarget)
      return `![${label || target}](${target})`
    })
    .replace(/\[\[([^[\]]+)\]\]/g, (_match, rawTarget: string) => {
      const { target, label } = parseObsidianTarget(rawTarget)
      return `[${label || target}](${OBSIDIAN_WIKI_PROTOCOL}${encodeURIComponent(target)})`
    })
}

export function renderMarkdownToRichTextHtml(source: string, scopeKey = 'surface') {
  const normalized = normalizeMarkdownForRichText(source)
  let mathNodeIndex = 0
  const file = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath)
    .use(remarkRehype, {
      handlers: {
        math(_state: unknown, node: { value?: string }) {
          const latex = node.value ?? ''
          const mathNodeId = buildMathNodeId(scopeKey, latex, mathNodeIndex++)
          return {
            type: 'element',
            tagName: 'anyreader-block-math',
            properties: {
              'data-latex': latex,
              'data-math-node-id': mathNodeId
            },
            children: [
              {
                type: 'text',
                value: latex
              }
            ]
          }
        },
        inlineMath(_state: unknown, node: { value?: string }) {
          const latex = node.value ?? ''
          const mathNodeId = buildMathNodeId(scopeKey, latex, mathNodeIndex++)
          return {
            type: 'element',
            tagName: 'anyreader-inline-math',
            properties: {
              'data-latex': latex,
              'data-math-node-id': mathNodeId
            },
            children: [
              {
                type: 'text',
                value: latex
              }
            ]
          }
        }
      }
    })
    .use(rehypeStringify)

  return String(file.processSync(normalized))
}

export function renderBlocksToRichTextHtml(blocks: RichTextBlock[]) {
  return blocks
    .map((block) => {
      const titleAttr = block.title ? ` data-title="${escapeHtmlAttribute(block.title)}"` : ''
      return `<anyreader-semantic-block data-content-path="${escapeHtmlAttribute(block.path)}"${titleAttr}>${renderMarkdownToRichTextHtml(
        block.markdown,
        block.path
      )}</anyreader-semantic-block>`
    })
    .join('')
}

export function buildDocumentLookup(documents: DocumentNode[]) {
  const byPath = new Map<string, string>()
  const byPathWithoutExtension = new Map<string, string>()
  const byTitle = new Map<string, string>()
  const byBaseName = new Map<string, string>()

  for (const document of documents) {
    const normalizedPath = normalizeVaultPath(document.path) ?? document.path
    const pathWithoutExtension = stripMarkdownExtension(normalizedPath)
    const baseName = pathWithoutExtension.split('/').pop() ?? document.title

    byPath.set(normalizedPath, document.id)
    byPathWithoutExtension.set(pathWithoutExtension, document.id)
    if (!byTitle.has(document.title)) {
      byTitle.set(document.title, document.id)
    }
    if (!byBaseName.has(baseName)) {
      byBaseName.set(baseName, document.id)
    }
  }

  return {
    byPath,
    byPathWithoutExtension,
    byTitle,
    byBaseName
  } satisfies DocumentLookup
}

export function decodeWikiHref(href: string) {
  if (!href.startsWith(OBSIDIAN_WIKI_PROTOCOL)) {
    return null
  }

  try {
    return decodeURIComponent(href.slice(OBSIDIAN_WIKI_PROTOCOL.length))
  } catch {
    return href.slice(OBSIDIAN_WIKI_PROTOCOL.length)
  }
}

export function isExternalUrl(value: string) {
  return /^(https?:|mailto:|tel:|data:|blob:|asset:)/i.test(value)
}

export function resolveLinkedDocumentId(href: string, lookup: DocumentLookup, currentDocumentPath?: string) {
  const wikiTarget = decodeWikiHref(href)
  if (wikiTarget) {
    return resolveDocumentCandidate(wikiTarget, lookup)
  }

  if (!href || isExternalUrl(href) || href.startsWith('#')) {
    return null
  }

  const [pathPart] = href.split('#')
  if (!pathPart) {
    return null
  }

  const joinedPath = currentDocumentPath
    ? joinVaultPath(dirnameVaultPath(currentDocumentPath), pathPart)
    : normalizeVaultPath(pathPart)

  if (joinedPath) {
    const byPath = lookup.byPath.get(joinedPath) ?? lookup.byPathWithoutExtension.get(stripMarkdownExtension(joinedPath))
    if (byPath) {
      return byPath
    }
  }

  return resolveDocumentCandidate(pathPart, lookup)
}

export async function resolveRichTextImageSrc(args: {
  src: string
  documentPath?: string
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
}) {
  const { src, documentPath, mountedVaultPath, remoteLibraryId, remoteRevisionId } = args
  if (!src) {
    return null
  }

  if (isExternalUrl(src)) {
    return src
  }

  if (mountedVaultPath) {
    for (const candidatePath of buildRichTextImagePathCandidates({ src, documentPath })) {
      const cacheKey = `${mountedVaultPath}::${candidatePath}`
      if (!mountedAssetUrlCache.has(cacheKey)) {
        mountedAssetUrlCache.set(cacheKey, resolveMountedVaultAssetUrlFromFs(mountedVaultPath, candidatePath))
      }

      const resolvedUrl = await mountedAssetUrlCache.get(cacheKey)
      if (resolvedUrl) {
        return resolvedUrl
      }
    }
  }

  if (remoteLibraryId && remoteRevisionId) {
    const cacheKey = `${remoteLibraryId}::${remoteRevisionId}::${documentPath ?? ''}::${src}`
    const cachedRemoteAsset = remoteAssetUrlValueCache.get(cacheKey)
    if (cachedRemoteAsset && cachedRemoteAsset.expiresAt > Date.now() + 1_000) {
      return cachedRemoteAsset.signedUrl
    }

    if (!remoteAssetUrlCache.has(cacheKey)) {
      remoteAssetUrlCache.set(
        cacheKey,
        resolveRemoteAsset({
          libraryId: remoteLibraryId,
          revisionId: remoteRevisionId,
          documentPath,
          src
        })
          .then((asset) => cacheRemoteAssetUrl(cacheKey, asset))
          .finally(() => {
            remoteAssetUrlCache.delete(cacheKey)
          })
      )
    }

    return (await remoteAssetUrlCache.get(cacheKey)) ?? null
  }

  return null
}

export function buildRichTextImagePathCandidates(args: { src: string; documentPath?: string }) {
  const normalizedSrc = normalizeRichTextAssetPath(args.src)
  if (!normalizedSrc) {
    return [] as string[]
  }

  const candidates: string[] = []
  const pushCandidate = (candidate: string | null) => {
    if (!candidate || candidates.includes(candidate)) {
      return
    }
    candidates.push(candidate)
  }

  if (args.documentPath) {
    pushCandidate(joinVaultPath(dirnameVaultPath(args.documentPath), normalizedSrc))
  }

  pushCandidate(normalizeVaultPath(normalizedSrc.replace(/^\/+/, '')))
  pushCandidate(normalizeVaultPath(stripLeadingRelativeSegments(normalizedSrc)))

  return candidates
}

function resolveDocumentCandidate(rawTarget: string, lookup: DocumentLookup) {
  const [targetWithoutHeading] = rawTarget.split('#')
  const normalizedTarget = normalizeVaultPath(targetWithoutHeading.replace(/^\/+/, ''))
  const targetWithoutExtension = stripMarkdownExtension(targetWithoutHeading.replace(/^\/+/, ''))
  const baseName = targetWithoutExtension.split('/').pop() ?? targetWithoutExtension

  return (
    (normalizedTarget ? lookup.byPath.get(normalizedTarget) : null) ??
    (normalizedTarget ? lookup.byPathWithoutExtension.get(stripMarkdownExtension(normalizedTarget)) : null) ??
    lookup.byPathWithoutExtension.get(targetWithoutExtension) ??
    lookup.byTitle.get(targetWithoutExtension) ??
    lookup.byBaseName.get(baseName) ??
    null
  )
}

async function resolveMountedVaultAssetUrlFromFs(vaultPath: string, relativePath: string) {
  if (!mountedVaultFsPromise) {
    mountedVaultFsPromise = import('./fs')
  }

  return (await mountedVaultFsPromise).resolveMountedVaultAssetUrl(vaultPath, relativePath)
}

function normalizeRichTextAssetPath(src: string) {
  const trimmed = collapseWrappedAssetPath(src.replace(/\\/g, '/').trim())
  if (!trimmed) {
    return ''
  }

  const delimiterIndex = trimmed.search(/[?#]/)
  if (delimiterIndex < 0) {
    return trimmed
  }

  return trimmed.slice(0, delimiterIndex)
}

function collapseWrappedAssetPath(path: string) {
  return path.replace(/\s*[\r\n]+\s*/g, '')
}

function stripLeadingRelativeSegments(path: string) {
  return path.replace(/^\/+/, '').replace(/^(?:\.\.?\/)+/, '')
}

function parseObsidianTarget(rawTarget: string) {
  const [targetPart, labelPart] = rawTarget.split('|')
  const target = targetPart.trim()
  const label = labelPart?.trim()

  return {
    target,
    label
  }
}

function cacheRemoteAssetUrl(cacheKey: string, asset: RemoteResolvedAsset | null) {
  if (!asset?.signedUrl) {
    remoteAssetUrlValueCache.delete(cacheKey)
    return null
  }

  remoteAssetUrlValueCache.set(cacheKey, {
    signedUrl: asset.signedUrl,
    expiresAt: asset.expiresAt
  })
  return asset.signedUrl
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function buildMathNodeId(scopeKey: string, latex: string, index: number) {
  return `math_${hashString(`${scopeKey}:${index}:${latex}`)}`
}
