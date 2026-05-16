import type { DocumentNode } from '../../domain'
import { listMountedVaultEntries, readMountedVaultTextFile } from '../fs'
import { basenameWithoutExtension, dirnameVaultPath, normalizeVaultPath } from '../vault-paths'
import { hashString, markdownToPlainText } from '../text'

const IGNORED_MOUNTED_VAULT_DIRECTORIES = new Set([
  'attachments',
  'bin',
  'build',
  'copilot',
  'coverage',
  'dist',
  'node_modules',
  'obj',
  'out',
  'target',
  'temp',
  'tmp',
  'venv',
  '__pycache__'
])
const MOUNTED_VAULT_READ_CONCURRENCY = 8

interface MountedVaultDocumentDraft {
  path: string
  title: string
  parentId: string | null
  order: number
  level: number
}

export async function loadMountedVaultDocuments(mountedVaultPath: string, repoId: string) {
  const drafts: MountedVaultDocumentDraft[] = []
  const folderPaths = new Set<string>()
  await scanMountedVaultDirectory({ mountedVaultPath, relativePath: '', folderPaths, drafts })
  drafts.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'))

  return {
    documents: drafts.map((draft) => createMountedVaultDocumentNode(draft, repoId)),
    folderPaths: [...folderPaths].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  }
}

export async function ensureMountedVaultDocumentsLoaded(
  documents: DocumentNode[],
  mountedVaultPath: string,
  documentIds: string[]
) {
  const documentIdSet = new Set(documentIds)
  const pendingDocuments = documents.filter((document) => documentIdSet.has(document.id) && !document.isContentLoaded)
  if (!pendingDocuments.length) return documents

  const loadedEntries = await mapWithConcurrency(pendingDocuments, MOUNTED_VAULT_READ_CONCURRENCY, async (document) => {
    const markdown = (await readMountedVaultTextFile(mountedVaultPath, document.path)) ?? ''
    return [document.id, withMountedVaultDocumentContent(document, markdown)] as const
  })
  const loadedById = new Map(loadedEntries)
  return documents.map((document) => loadedById.get(document.id) ?? document)
}

async function scanMountedVaultDirectory(args: {
  mountedVaultPath: string
  relativePath: string
  folderPaths: Set<string>
  drafts: MountedVaultDocumentDraft[]
}) {
  const entries = (await listMountedVaultEntries(args.mountedVaultPath, args.relativePath)).sort(sortMountedVaultEntries)
  let documentOrder = 0

  for (const entry of entries) {
    if (entry.isDir) {
      if (entry.name.startsWith('.') || IGNORED_MOUNTED_VAULT_DIRECTORIES.has(entry.name.toLowerCase())) continue
      const folderPath = normalizeVaultPath(entry.path)
      if (!folderPath) continue
      args.folderPaths.add(folderPath)
      await scanMountedVaultDirectory({ ...args, relativePath: folderPath })
      continue
    }

    if (!entry.name.toLowerCase().endsWith('.md')) continue
    const path = normalizeVaultPath(entry.path)
    if (!path) continue
    args.drafts.push({
      path,
      title: basenameWithoutExtension(path),
      parentId: dirnameVaultPath(path) || null,
      order: documentOrder++,
      level: path.split('/').length
    })
  }
}

function createMountedVaultDocumentNode(draft: MountedVaultDocumentDraft, repoId: string): DocumentNode {
  const timestamp = new Date().toISOString()
  return {
    id: draft.path,
    repoId,
    path: draft.path,
    title: draft.title,
    parentId: draft.parentId,
    childrenIds: [],
    order: draft.order,
    level: draft.level,
    contentMd: '',
    isContentLoaded: false,
    contentVersion: '',
    contentPlainText: '',
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function withMountedVaultDocumentContent(document: DocumentNode, markdown: string): DocumentNode {
  return {
    ...document,
    contentMd: markdown,
    isContentLoaded: true,
    contentVersion: hashString(markdown),
    contentPlainText: markdownToPlainText(markdown)
  }
}

function sortMountedVaultEntries(left: { name: string; isDir: boolean }, right: { name: string; isDir: boolean }) {
  if (left.isDir !== right.isDir) return left.isDir ? -1 : 1
  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
) {
  const results = new Array<TOutput>(items.length)
  let nextIndex = 0
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++
      results[currentIndex] = await mapper(items[currentIndex], currentIndex)
    }
  }))
  return results
}
