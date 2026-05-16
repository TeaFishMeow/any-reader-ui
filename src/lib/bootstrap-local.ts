import type {
  AppConfig,
  CanvasState,
  DocumentCatalogEntry,
  DocumentNode,
  QARecord,
  RepoMeta,
  RepositoryBinding,
  SidebarNode,
  WorkspaceSnapshot
} from '../domain'
import { CURRENT_SELECTOR_VERSION } from './app-helpers'
import {
  defaultAppConfig,
  defaultCanvasState,
  MAIN_CANVAS_ID
} from './defaults'
import { DEMO_REPO_ID, demoDocuments, demoRepoMeta } from '../services/mock/demoWorkspace'
import {
  getDataRoot,
  listDirEntries,
  mountedVaultExists,
  movePathToTrash,
  pathExists,
  readTextFile,
  writeTextFile
} from './fs'
import { basenameVaultPath, dirnameVaultPath } from './vault-paths'
import { hashString, markdownToPlainText } from './text'
import { normalizeConfig } from './workspace/normalizeConfig'
import { normalizeCanvas, reconcileCanvas } from './workspace/normalizeCanvas'
import { normalizeQaRecord } from './workspace/normalizeQaRecord'
import { ensureMountedVaultDocumentsLoaded, loadMountedVaultDocuments } from './workspace/mountedVault'
import {
  asNumber,
  asOptionalString,
  asString,
  asStringArray,
  isObject,
  isOneOf,
  type JsonRecord
} from './workspace/coerce'

const REPOSITORY_SOURCE_MODES = ['demo', 'mounted-vault', 'remote-library'] as const
async function readJson<T>(relativePath: string) {
  const raw = await readTextFile(relativePath)
  if (!raw) {
    return null
  }
  return JSON.parse(raw) as T
}

async function writeJson(relativePath: string, value: unknown) {
  await writeTextFile(relativePath, JSON.stringify(value, null, 2))
}

export async function bootstrapWorkspace(): Promise<WorkspaceSnapshot> {
  const dataRoot = await getDataRoot()
  await ensureBaseState()

  const config = await loadConfig()
  const repositoryState = await loadRepositoryWorkspace(config)
  const qaRecords = await loadQaRecords(config)
  const canvas = await loadCanvas(qaRecords)

  return {
    dataRoot,
    repo: repositoryState.repo,
    documents: repositoryState.documents,
    sidebarNodes: repositoryState.sidebarNodes,
    config,
    canvas,
    qaRecords,
    workspaceVersion: 0,
    repositoryBinding: repositoryState.repositoryBinding
  }
}

export async function saveWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }) {
  await writeJson('config.json', args.config)
  await writeJson(`records/canvas/${args.canvas.id}.json`, args.canvas)
  return args.version
}

export async function saveQaRecord(record: QARecord) {
  await writeJson(`records/qa/${record.id}.json`, record)
}

export async function deleteQaRecord(record: QARecord) {
  const updated: QARecord = {
    ...record,
    lifecycle: {
      ...record.lifecycle,
      isDeleted: true,
      deletedAt: new Date().toISOString()
    },
    updatedAt: new Date().toISOString()
  }
  await saveQaRecord(updated)
}

async function ensureBaseState() {
  if (!(await pathExists('config.json'))) {
    await writeJson('config.json', defaultAppConfig())
  }

  if (!(await pathExists(`records/canvas/${MAIN_CANVAS_ID}.json`))) {
    await writeJson(`records/canvas/${MAIN_CANVAS_ID}.json`, defaultCanvasState())
  }
}

async function ensureDemoWorkspace() {
  if (!(await pathExists(`repos/${DEMO_REPO_ID}/repo-meta.json`))) {
    await writeJson(`repos/${DEMO_REPO_ID}/repo-meta.json`, demoRepoMeta)
  }

  if (!(await pathExists(`repos/${DEMO_REPO_ID}/doc-index.json`))) {
    await writeJson(
      `repos/${DEMO_REPO_ID}/doc-index.json`,
      demoDocuments.map((item) => item.catalog)
    )
  }

  for (const document of demoDocuments) {
    const path = `repos/${DEMO_REPO_ID}/docs/${document.catalog.id}.md`
    if (!(await pathExists(path))) {
      await writeTextFile(path, document.markdown)
    }
  }
}

async function loadConfig() {
  const relativePath = 'config.json'
  const raw = await readJson<unknown>(relativePath)
  const normalized = normalizeConfig(raw)
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeJson(relativePath, normalized)
  }
  return normalized
}

async function loadCanvas(qaRecords: QARecord[]) {
  const relativePath = `records/canvas/${MAIN_CANVAS_ID}.json`
  const raw = await readJson<unknown>(relativePath)
  const normalized = reconcileCanvas(normalizeCanvas(raw), qaRecords)
  if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
    await writeJson(relativePath, normalized)
  }
  return normalized
}

async function loadRepositoryWorkspace(config: AppConfig): Promise<{
  repo: RepoMeta
  documents: DocumentNode[]
  sidebarNodes: SidebarNode[]
  repositoryBinding: RepositoryBinding
}> {
  if (config.repository.sourceMode === 'mounted-vault') {
    const mountedVaultPath = normalizeMountedVaultPath(config.repository.mountedVaultPath)
    if (!mountedVaultPath) {
      return loadDemoWorkspace(config, {
        requestedSourceMode: 'mounted-vault',
        activeSourceMode: 'demo',
        issue: '尚未配置 Obsidian 仓库目录，已回退到演示仓库。',
        mountedVaultPath: config.repository.mountedVaultPath
      })
    }

    const vaultAvailable = await mountedVaultExists(mountedVaultPath)
    if (!vaultAvailable) {
      return loadDemoWorkspace(config, {
        requestedSourceMode: 'mounted-vault',
        activeSourceMode: 'demo',
        issue: `找不到已配置的 Obsidian 仓库目录：${mountedVaultPath}`,
        mountedVaultPath
      })
    }

    try {
      return await loadMountedVaultWorkspace(config, mountedVaultPath)
    } catch (error) {
      return loadDemoWorkspace(config, {
        requestedSourceMode: 'mounted-vault',
        activeSourceMode: 'demo',
        issue: `挂载仓库读取失败：${error instanceof Error ? error.message : '未知错误'}`,
        mountedVaultPath
      })
    }
  }

  return loadDemoWorkspace(config, {
    requestedSourceMode: 'demo',
    activeSourceMode: 'demo'
  })
}

async function loadDemoWorkspace(config: AppConfig, binding: RepositoryBinding) {
  await ensureDemoWorkspace()
  const { repo: demoRepo, documents } = await loadRepo(DEMO_REPO_ID)
  const repo = applyCurrentDocumentPreference(
    {
      ...demoRepo,
      sourceMode: 'demo',
      mountedVaultPath: undefined
    },
    documents,
    config.repository.lastOpenedDocumentPath
  )
  const sidebarNodes = buildSidebarNodes(repo, documents)

  return {
    repo,
    documents,
    sidebarNodes,
    repositoryBinding: binding
  }
}

async function loadMountedVaultWorkspace(config: AppConfig, mountedVaultPath: string) {
  const repoId = `vault-${hashString(mountedVaultPath).slice(0, 12)}`
  const { documents: scannedDocuments, folderPaths } = await loadMountedVaultDocuments(mountedVaultPath, repoId)
  if (scannedDocuments.length === 0) {
    throw new Error('挂载仓库中没有可读取的 Markdown 文档。')
  }

  const currentDocument = resolveCurrentDocument(scannedDocuments, config.repository.lastOpenedDocumentPath)
  const documents = await ensureMountedVaultDocumentsLoaded(scannedDocuments, mountedVaultPath, [currentDocument.id])
  const repo: RepoMeta = {
    id: repoId,
    title: basenameFromAnyPath(mountedVaultPath) || 'Obsidian 仓库',
    rootDocumentIds: scannedDocuments.filter((document) => document.parentId === null).map((document) => document.id),
    currentDocumentId: currentDocument.id,
    sourceMode: 'mounted-vault',
    mountedVaultPath,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  return {
    repo,
    documents,
    sidebarNodes: buildSidebarNodes(repo, documents, folderPaths),
    repositoryBinding: {
      requestedSourceMode: 'mounted-vault',
      activeSourceMode: 'mounted-vault',
      mountedVaultPath
    } satisfies RepositoryBinding
  }
}

async function loadRepo(repoId: string) {
  const metaPath = `repos/${repoId}/repo-meta.json`
  const catalogPath = `repos/${repoId}/doc-index.json`
  const rawMeta = await readJson<unknown>(metaPath)
  const rawCatalog = await readJson<unknown>(catalogPath)

  if (!Array.isArray(rawCatalog)) {
    throw new Error(`仓库 ${repoId} 缺少可用的文档索引。`)
  }

  const documents = await Promise.all(
    rawCatalog.map(async (entry, index) => {
      const rawEntry = isObject(entry) ? entry : {}
      const documentId = asString(rawEntry.id, `doc-${index + 1}`)
      const markdown = (await readTextFile(`repos/${repoId}/docs/${documentId}.md`)) ?? ''
      return normalizeDocumentEntry(rawEntry, repoId, markdown, index)
    })
  )

  const normalizedRepo = normalizeRepoMeta(rawMeta, repoId, documents)
  const normalizedCatalog = documents.map<DocumentCatalogEntry>(({ contentMd, isContentLoaded, ...catalog }) => catalog)

  if (JSON.stringify(rawMeta) !== JSON.stringify(normalizedRepo)) {
    await writeJson(metaPath, normalizedRepo)
  }
  if (JSON.stringify(rawCatalog) !== JSON.stringify(normalizedCatalog)) {
    await writeJson(catalogPath, normalizedCatalog)
  }

  return {
    repo: normalizedRepo,
    documents
  }
}

async function loadQaRecords(config: AppConfig) {
  const entries = await listDirEntries('records/qa')
  const files = entries.filter((entry) => !entry.isDir && entry.name.endsWith('.json'))
  const records: QARecord[] = []

  for (const entry of files) {
    const relativePath = `records/qa/${entry.name}`
    const raw = await readJson<unknown>(relativePath)
    const normalized = normalizeQaRecord(raw, config)

    if (!normalized) {
      await movePathToTrash(relativePath)
      continue
    }

    if (normalized.anchor.selectorVersion !== CURRENT_SELECTOR_VERSION) {
      await movePathToTrash(relativePath)
      continue
    }

    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
      await writeJson(relativePath, normalized)
    }

    records.push(normalized)
  }

  return records.sort((left, right) => left.createdAt.localeCompare(right.createdAt))
}


function normalizeRepoMeta(raw: unknown, repoId: string, documents: DocumentNode[]): RepoMeta {
  const source = isObject(raw) ? raw : {}
  const documentIds = new Set(documents.map((document) => document.id))
  const rootDocumentIds = asStringArray(source.rootDocumentIds).filter((id) => documentIds.has(id))
  const fallbackRootIds = documents.filter((document) => document.parentId === null).map((document) => document.id)
  const normalizedRootIds = rootDocumentIds.length > 0 ? rootDocumentIds : fallbackRootIds
  const currentDocumentId = asString(source.currentDocumentId, normalizedRootIds[0] ?? documents[0]?.id ?? '')

  return {
    id: repoId,
    title: asString(source.title, repoId),
    rootDocumentIds: normalizedRootIds,
    currentDocumentId: documentIds.has(currentDocumentId) ? currentDocumentId : normalizedRootIds[0] ?? '',
    sourceMode: isOneOf(source.sourceMode, REPOSITORY_SOURCE_MODES) ? source.sourceMode : 'demo',
    libraryId: asOptionalString(source.libraryId),
    revisionId: asOptionalString(source.revisionId),
    mountedVaultPath: asOptionalString(source.mountedVaultPath),
    createdAt: asString(source.createdAt, new Date().toISOString()),
    updatedAt: asString(source.updatedAt, new Date().toISOString())
  }
}

function normalizeDocumentEntry(raw: JsonRecord, repoId: string, markdown: string, index: number): DocumentNode {
  return {
    id: asString(raw.id, `doc-${index + 1}`),
    repoId,
    path: asString(raw.path, `doc-${index + 1}`),
    title: asString(raw.title, `文档 ${index + 1}`),
    parentId: raw.parentId === null ? null : asOptionalString(raw.parentId) ?? null,
    childrenIds: asStringArray(raw.childrenIds),
    order: asNumber(raw.order, index),
    level: asNumber(raw.level, 1),
    contentMd: markdown,
    isContentLoaded: true,
    contentVersion: asString(raw.contentVersion, '1'),
    contentPlainText: markdownToPlainText(markdown),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    updatedAt: asString(raw.updatedAt, new Date().toISOString())
  }
}

function resolveSidebarParentId(parentPath: string | null | undefined, repoId: string, documentIdByPath: Map<string, string>) {
  if (!parentPath) {
    return repoId
  }

  return documentIdByPath.get(parentPath) ?? `folder:${parentPath}`
}

function buildSidebarNodes(repo: RepoMeta, documents: DocumentNode[], folderPaths: string[] = []) {
  const repoNode: SidebarNode = {
    id: repo.id,
    type: 'repo',
    label: repo.title,
    parentId: null,
    childrenIds: [],
    order: 0
  }

  const nodesById = new Map<string, SidebarNode>([[repoNode.id, repoNode]])
  const childBuckets = new Map<string, SidebarNode[]>()
  const documentIdByPath = new Map(documents.map((document) => [document.path, document.id]))

  for (const folderPath of folderPaths) {
    if (documentIdByPath.has(folderPath)) {
      continue
    }

    const node: SidebarNode = {
      id: `folder:${folderPath}`,
      type: 'folder',
      label: basenameVaultPath(folderPath),
      parentId: resolveSidebarParentId(dirnameVaultPath(folderPath), repo.id, documentIdByPath),
      childrenIds: [],
      order: 0,
      path: folderPath
    }
    nodesById.set(node.id, node)
    childBuckets.set(node.id, [])
    pushSidebarChild(childBuckets, node.parentId ?? repo.id, node)
  }

  for (const document of documents) {
    const node: SidebarNode = {
      id: document.id,
      type: 'document',
      label: document.title,
      parentId: resolveSidebarParentId(document.parentId, repo.id, documentIdByPath),
      childrenIds: [],
      order: document.order,
      path: document.path,
      documentId: document.id
    }
    nodesById.set(node.id, node)
    childBuckets.set(node.id, [])
    pushSidebarChild(childBuckets, node.parentId ?? repo.id, node)
  }

  for (const [parentId, children] of childBuckets.entries()) {
    const sortedChildren = [...children].sort(sortSidebarNodes)
    const parentNode = nodesById.get(parentId)
    if (!parentNode) {
      continue
    }
    parentNode.childrenIds = sortedChildren.map((child) => child.id)
  }

  return [repoNode, ...[...nodesById.values()].filter((node) => node.id !== repoNode.id)]
}

function pushSidebarChild(buckets: Map<string, SidebarNode[]>, parentId: string, child: SidebarNode) {
  buckets.set(parentId, [...(buckets.get(parentId) ?? []), child])
}

function sortSidebarNodes(left: SidebarNode, right: SidebarNode) {
  if (left.type !== right.type) {
    if (left.type === 'folder') {
      return -1
    }
    if (right.type === 'folder') {
      return 1
    }
  }

  if (left.order !== right.order) {
    return left.order - right.order
  }

  return left.label.localeCompare(right.label, 'zh-Hans-CN')
}

function applyCurrentDocumentPreference(repo: RepoMeta, documents: DocumentNode[], preferredPath: string | undefined) {
  const preferredDocument = preferredPath
    ? documents.find((document) => document.path === preferredPath || document.id === preferredPath) ?? null
    : null
  const currentDocumentStillExists = documents.some((document) => document.id === repo.currentDocumentId)

  return {
    ...repo,
    currentDocumentId: preferredDocument?.id ?? (currentDocumentStillExists ? repo.currentDocumentId : documents[0]?.id ?? '')
  }
}

function resolveCurrentDocument(documents: DocumentNode[], preferredPath: string | undefined) {
  const document = preferredPath
    ? documents.find((candidate) => candidate.path === preferredPath || candidate.id === preferredPath)
    : undefined
  if (document) return document
  if (documents[0]) return documents[0]
  throw new Error('No documents available.')
}

function normalizeMountedVaultPath(path: string | undefined) {
  return typeof path === 'string' && path.trim().length > 0 ? path.trim() : undefined
}

function basenameFromAnyPath(path: string) {
  const normalized = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return normalized[normalized.length - 1] ?? ''
}
