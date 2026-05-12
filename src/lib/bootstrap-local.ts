import type {
  AppConfig,
  AskAction,
  CanvasState,
  DocumentCatalogEntry,
  DocumentNode,
  EmbeddedAnchor,
  PromptTemplate,
  QARecord,
  ReadingContextMode,
  RepoMeta,
  RepositoryBinding,
  SidebarNode,
  WidgetState,
  WorkspaceSnapshot
} from '../types/domain'
import {
  deleteRemoteQaRecord,
  fetchRemoteWorkspaceSnapshot,
  purgeRemoteQaRecord,
  saveRemoteWorkspaceState,
  saveRemoteQaRecord
} from './api'
import {
  CURRENT_SELECTOR_VERSION,
  DEFAULT_WIDGET_HEIGHT,
  DEFAULT_WIDGET_WIDTH,
  buildAnchorFingerprint,
  buildFullPrompt,
  clampWidgetSize,
  inferPromptIntent
} from './app-helpers'
import {
  applyPromptTemplateDefaults,
  defaultAppConfig,
  defaultCanvasState,
  demoDocuments,
  demoRepoMeta,
  DEMO_REPO_ID,
  MAIN_CANVAS_ID
} from './defaults'
import {
  getDataRoot,
  listDirEntries,
  listMountedVaultEntries,
  mountedVaultExists,
  movePathToTrash,
  pathExists,
  readMountedVaultTextFile,
  readTextFile,
  removePath,
  writeTextFile
} from './fs'
import { useRemoteWorkspaceStore } from './env'
import { basenameWithoutExtension, basenameVaultPath, dirnameVaultPath, normalizeVaultPath } from './vault-paths'
import { getMathAnchorLatex, getMathDisplayText, getMathPromptText } from './math-selection'
import { createId, hashString, markdownToPlainText } from './text'

type JsonRecord = Record<string, unknown>

const SURFACE_TYPES = ['reader', 'widget', 'sidebar'] as const
const SIDEBAR_NODE_TYPES = ['repo', 'folder', 'document'] as const
const CONTEXT_MODES = [
  'paragraph',
  'section',
  'directory',
  'viewport-range',
  'manual-selection',
  'widget-local',
  'sidebar-node'
] as const
const DEFAULT_CONTEXT_MODES = ['paragraph', 'section', 'directory', 'viewport-range'] as const
const PROMPT_INTENTS = ['symbol_meaning', 'step_justification', 'theorem_mapping', 'intuition', 'summary', 'compare', 'custom'] as const
const ANSWER_STATUSES = ['pending', 'streaming', 'done', 'error', 'aborted'] as const
const REQUEST_STATES = ['idle', 'editing', 'pending', 'streaming', 'done', 'error'] as const
const MARKER_TYPES = ['underline', 'bracket', 'none'] as const
const SELECTED_TEXT_KINDS = ['plain', 'math', 'node-label', 'ai-generated', 'mixed'] as const
const TEMPLATE_SCOPES = ['global', 'repo', 'document-type'] as const
const WIDGET_TYPES = ['ask', 'qa-record'] as const
const REPOSITORY_SOURCE_MODES = ['demo', 'mounted-vault', 'remote-library'] as const
const STORAGE_MODES = ['local-first-files', 'remote-api'] as const
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
  if (useRemoteWorkspaceStore()) {
    return fetchRemoteWorkspaceSnapshot()
  }

  const dataRoot = await getDataRoot()
  await ensureBaseState()

  const config = await loadConfig()
  const repositoryState = await loadRepositoryWorkspace(config)
  const qaRecords = await loadQaRecords(config)
  const canvas = await loadCanvas(qaRecords)

  await rebuildQaIndexes(qaRecords)

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

export async function saveConfig(config: AppConfig) {
  if (useRemoteWorkspaceStore()) {
    void config
    throw new Error('Legacy remote workspace config saves are deprecated. Use saveWorkspaceState().')
  }

  await writeJson('config.json', config)
}

export async function saveCanvas(canvas: CanvasState) {
  if (useRemoteWorkspaceStore()) {
    void canvas
    throw new Error('Legacy remote workspace canvas saves are deprecated. Use saveWorkspaceState().')
  }

  await writeJson(`records/canvas/${canvas.id}.json`, canvas)
}

export async function saveWorkspaceState(args: { config: AppConfig; canvas: CanvasState; version: number }) {
  if (useRemoteWorkspaceStore()) {
    return saveRemoteWorkspaceState(args)
  }

  await writeJson('config.json', args.config)
  await writeJson(`records/canvas/${args.canvas.id}.json`, args.canvas)
  return args.version
}

export async function saveQaRecord(record: QARecord) {
  if (useRemoteWorkspaceStore()) {
    await saveRemoteQaRecord(record)
    return
  }

  await writeJson(`records/qa/${record.id}.json`, record)
  await rebuildQaIndexes()
}

export async function deleteQaRecord(record: QARecord) {
  if (useRemoteWorkspaceStore()) {
    await deleteRemoteQaRecord(record)
    return
  }

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

export async function purgeQaRecord(recordId: string) {
  if (useRemoteWorkspaceStore()) {
    await purgeRemoteQaRecord(recordId)
    return
  }

  await movePathToTrash(`records/qa/${recordId}.json`)
  await rebuildQaIndexes()
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
  const { documents: scannedDocuments, folderPaths } = await loadMountedVaultDocuments(mountedVaultPath)
  if (scannedDocuments.length === 0) {
    throw new Error('挂载仓库中没有可读取的 Markdown 文档。')
  }

  const repoId = `vault-${hashString(mountedVaultPath).slice(0, 12)}`
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

async function loadMountedVaultDocuments(mountedVaultPath: string) {
  const drafts: MountedVaultDocumentDraft[] = []
  const folderPaths = new Set<string>()

  await scanMountedVaultDirectory({
    mountedVaultPath,
    relativePath: '',
    folderPaths,
    drafts
  })

  drafts.sort((left, right) => left.path.localeCompare(right.path, 'zh-Hans-CN'))

  const repoId = `vault-${hashString(mountedVaultPath).slice(0, 12)}`
  const documents = drafts.map((draft) => createMountedVaultDocumentNode(draft, repoId))

  return {
    documents,
    folderPaths: [...folderPaths].sort((left, right) => left.localeCompare(right, 'zh-Hans-CN'))
  }
}

export async function ensureMountedVaultDocumentsLoaded(
  documents: DocumentNode[],
  mountedVaultPath: string,
  documentIds: string[]
) {
  if (documentIds.length === 0) {
    return documents
  }

  const documentIdSet = new Set(documentIds)
  const pendingDocuments = documents.filter((document) => documentIdSet.has(document.id) && !document.isContentLoaded)
  if (pendingDocuments.length === 0) {
    return documents
  }

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
  drafts: Array<{
    path: string
    title: string
    parentId: string | null
    order: number
    level: number
  }>
}) {
  const entries = (await listMountedVaultEntries(args.mountedVaultPath, args.relativePath)).sort(sortMountedVaultEntries)
  let documentOrder = 0

  for (const entry of entries) {
    if (entry.isDir) {
      if (shouldIgnoreMountedVaultDirectory(entry.name)) {
        continue
      }

      const normalizedFolderPath = normalizeVaultPath(entry.path)
      if (!normalizedFolderPath) {
        continue
      }

      args.folderPaths.add(normalizedFolderPath)
      await scanMountedVaultDirectory({
        ...args,
        relativePath: normalizedFolderPath
      })
      continue
    }

    if (!entry.name.toLowerCase().endsWith('.md')) {
      continue
    }

    const normalizedDocumentPath = normalizeVaultPath(entry.path)
    if (!normalizedDocumentPath) {
      continue
    }

    const parentPath = dirnameVaultPath(normalizedDocumentPath)
    args.drafts.push({
      path: normalizedDocumentPath,
      title: basenameWithoutExtension(normalizedDocumentPath),
      parentId: parentPath || null,
      order: documentOrder++,
      level: normalizedDocumentPath.split('/').length
    })
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

async function rebuildQaIndexes(records?: QARecord[]) {
  const activeRecords = (records ?? (await loadQaRecords(await loadConfig()))).filter((record) => !record.lifecycle.isDeleted)
  const byDocument = new Map<string, string[]>()
  const byWidget = new Map<string, string[]>()
  const byFingerprint = new Map<string, string[]>()

  for (const record of activeRecords) {
    if (record.sourceDocumentId) {
      byDocument.set(record.sourceDocumentId, [...(byDocument.get(record.sourceDocumentId) ?? []), record.id])
    }
    if (record.sourceWidgetId) {
      byWidget.set(record.sourceWidgetId, [...(byWidget.get(record.sourceWidgetId) ?? []), record.id])
    }
    byFingerprint.set(record.anchor.anchorFingerprint, [
      ...(byFingerprint.get(record.anchor.anchorFingerprint) ?? []),
      record.id
    ])
  }

  await Promise.all([
    clearIndexDirectory('indexes/qa-by-doc'),
    clearIndexDirectory('indexes/qa-by-widget'),
    clearIndexDirectory('indexes/qa-by-anchor-fingerprint')
  ])

  await Promise.all([
    ...[...byDocument.entries()].map(([id, qaRecordIds]) =>
      writeJson(`indexes/qa-by-doc/${id}.json`, { documentId: id, qaRecordIds })
    ),
    ...[...byWidget.entries()].map(([id, qaRecordIds]) =>
      writeJson(`indexes/qa-by-widget/${id}.json`, { widgetId: id, qaRecordIds })
    ),
    ...[...byFingerprint.entries()].map(([anchorFingerprint, qaRecordIds]) =>
      writeJson(`indexes/qa-by-anchor-fingerprint/${anchorFingerprint}.json`, {
        anchorFingerprint,
        qaRecordIds
      })
    )
  ])
}

async function clearIndexDirectory(relativePath: string) {
  const entries = await listDirEntries(relativePath)
  await Promise.all(entries.map((entry) => removePath(entry.path)))
}

function normalizeConfig(raw: unknown): AppConfig {
  const defaults = defaultAppConfig()
  const source = isObject(raw) ? raw : {}
  const layout = isObject(source.layout) ? source.layout : {}
  const askMenu = isObject(source.askMenu) ? source.askMenu : {}
  const navigation = isObject(source.navigation) ? source.navigation : {}
  const context = isObject(source.context) ? source.context : {}
  const rendering = isObject(source.rendering) ? source.rendering : {}
  const storage = isObject(source.storage) ? source.storage : {}
  const shortcuts = isObject(source.shortcuts) ? source.shortcuts : {}
  const learning = isObject(source.learning) ? source.learning : {}
  const provider = isObject(source.provider) ? source.provider : {}
  const repository = isObject(source.repository) ? source.repository : {}
  const leftSidebarMinWidth = Math.max(160, asNumber(layout.leftSidebarMinWidth, defaults.layout.leftSidebarMinWidth))
  const rightSidebarMinWidth = Math.max(160, asNumber(layout.rightSidebarMinWidth, defaults.layout.rightSidebarMinWidth))
  const legacyContentFontPx = Math.max(
    12,
    Math.min(28, asNumber(rendering.contentFontPx, defaults.rendering.readerFontPx))
  )

  return {
    layout: {
      leftSidebarCollapsed: asBoolean(layout.leftSidebarCollapsed, defaults.layout.leftSidebarCollapsed),
      rightSidebarCollapsed: asBoolean(layout.rightSidebarCollapsed, defaults.layout.rightSidebarCollapsed),
      leftSidebarWidth: Math.max(leftSidebarMinWidth, asNumber(layout.leftSidebarWidth, defaults.layout.leftSidebarWidth)),
      rightSidebarWidth: Math.max(
        rightSidebarMinWidth,
        asNumber(layout.rightSidebarWidth, defaults.layout.rightSidebarWidth)
      ),
      leftSidebarMinWidth,
      rightSidebarMinWidth,
      collapsedRailWidth: Math.max(28, asNumber(layout.collapsedRailWidth, defaults.layout.collapsedRailWidth)),
      rememberLayout: asBoolean(layout.rememberLayout, defaults.layout.rememberLayout)
    },
    askMenu: {
      maxVisibleTemplates: asNumber(askMenu.maxVisibleTemplates, defaults.askMenu.maxVisibleTemplates)
    },
    navigation: {
      collapsedSidebarFolderIds: [...new Set(asStringArray(navigation.collapsedSidebarFolderIds))],
      readerScrollPositions: normalizeReaderScrollPositions(navigation.readerScrollPositions)
    },
    context: {
      defaultMode: isOneOf(context.defaultMode, DEFAULT_CONTEXT_MODES)
        ? context.defaultMode
        : defaults.context.defaultMode,
      viewportRangeBlocks: asNumber(context.viewportRangeBlocks, defaults.context.viewportRangeBlocks),
      widgetDefaultMode: 'widget-local'
    },
    rendering: {
      readerFontPx: Math.max(12, Math.min(28, asNumber(rendering.readerFontPx, legacyContentFontPx))),
      widgetFontPx: Math.max(12, Math.min(28, asNumber(rendering.widgetFontPx, legacyContentFontPx))),
      shortSelectionCharThreshold: asNumber(
        rendering.shortSelectionCharThreshold,
        defaults.rendering.shortSelectionCharThreshold
      )
    },
    storage: {
      mode: useRemoteWorkspaceStore()
        ? 'remote-api'
        : isOneOf(storage.mode, STORAGE_MODES)
          ? storage.mode
          : defaults.storage.mode,
      autoSaveMs: asNumber(storage.autoSaveMs, defaults.storage.autoSaveMs)
    },
    shortcuts: {
      toggleLeft: asString(shortcuts.toggleLeft, defaults.shortcuts.toggleLeft),
      toggleRight: asString(shortcuts.toggleRight, defaults.shortcuts.toggleRight),
      openContext: asString(shortcuts.openContext, defaults.shortcuts.openContext)
    },
    learning: normalizeLearningConfig(learning, defaults),
    provider: {
      baseUrl: asString(provider.baseUrl, defaults.provider.baseUrl),
      apiKey: asString(provider.apiKey, defaults.provider.apiKey),
      model: asString(provider.model, defaults.provider.model),
      temperature: asNumber(provider.temperature, defaults.provider.temperature)
    },
    repository: {
      sourceMode: isOneOf(repository.sourceMode, REPOSITORY_SOURCE_MODES)
        ? repository.sourceMode
        : defaults.repository.sourceMode,
      libraryId: asOptionalString(repository.libraryId) ?? defaults.repository.libraryId,
      revisionId: asOptionalString(repository.revisionId) ?? defaults.repository.revisionId,
      mountedVaultPath: asOptionalString(repository.mountedVaultPath) ?? defaults.repository.mountedVaultPath,
      lastOpenedDocumentPath:
        asOptionalString(repository.lastOpenedDocumentPath) ?? defaults.repository.lastOpenedDocumentPath
    },
    templates: normalizeTemplates(source.templates, defaults.templates)
  }
}

function normalizeReaderScrollPositions(value: unknown) {
  if (!isObject(value)) {
    return {}
  }

  return Object.fromEntries(
    Object.entries(value).flatMap(([path, scrollTop]) =>
      path && typeof scrollTop === 'number' && Number.isFinite(scrollTop)
        ? [[path, Math.max(0, Math.round(scrollTop))]]
        : []
    )
  )
}

function normalizeLearningConfig(raw: JsonRecord, defaults: AppConfig) {
  const directPrompt = asString(raw.prompt)
  if (directPrompt) {
    return {
      prompt: directPrompt
    }
  }

  const legacyStates = Array.isArray(raw.states)
    ? raw.states
        .map((state) => {
          const source = isObject(state) ? state : {}
          const id = asString(source.id)
          const prompt = asString(source.prompt)
          return id || prompt ? { id, prompt } : null
        })
        .filter((state): state is { id: string; prompt: string } => Boolean(state))
    : []
  const currentStateId = asString(raw.currentStateId)
  const legacyPrompt =
    legacyStates.find((state) => state.id === currentStateId)?.prompt ?? legacyStates[0]?.prompt ?? defaults.learning.prompt

  return {
    prompt: legacyPrompt
  }
}

function normalizeTemplates(raw: unknown, defaults: PromptTemplate[]) {
  const source = Array.isArray(raw) ? raw : defaults

  return applyPromptTemplateDefaults(source.map((template, index) => {
    const draft = isObject(template) ? template : {}
    const fallback = defaults[index] ?? defaults[defaults.length - 1]

    return {
      id: asString(draft.id, fallback?.id ?? createId('template')),
      title: asString(draft.title, fallback?.title ?? `模板 ${index + 1}`),
      body: asString(draft.body, fallback?.body ?? ''),
      color: asString(draft.color, fallback?.color ?? '#4a5568'),
      order: asNumber(draft.order, index),
      isBuiltIn: asBoolean(draft.isBuiltIn, fallback?.isBuiltIn ?? false),
      isEnabled: asBoolean(draft.isEnabled, fallback?.isEnabled ?? true),
      scope: isOneOf(draft.scope, TEMPLATE_SCOPES) ? draft.scope : fallback?.scope ?? 'global'
    }
  }))
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

function normalizeCanvas(raw: unknown): CanvasState {
  const defaults = defaultCanvasState()
  const source = isObject(raw) ? raw : {}
  const viewport = isObject(source.viewport) ? source.viewport : {}
  const selection = isObject(source.selection) ? source.selection : {}
  const widgetStates: WidgetState[] = []

  if (Array.isArray(source.widgetStates)) {
    source.widgetStates.forEach((widget, index) => {
      const normalizedWidget = normalizeWidgetState(widget, index)
      if (!normalizedWidget) {
        return
      }

      widgetStates.push(normalizedWidget)
    })
  }

  const nextWidgetStates = widgetStates.length > 0 || Array.isArray(source.widgetStates) ? widgetStates : defaults.widgetStates
  const widgetIdSet = new Set(nextWidgetStates.map((widget) => widget.id))
  const selectedWidgetId = selection.widgetId === null ? null : asOptionalString(selection.widgetId)

  return {
    id: asString(source.id, defaults.id),
    viewport: {
      x: asNumber(viewport.x, defaults.viewport.x),
      y: asNumber(viewport.y, defaults.viewport.y),
      zoom: asNumber(viewport.zoom, defaults.viewport.zoom)
    },
    widgetStates: nextWidgetStates,
    selection: {
      widgetId:
        selectedWidgetId && widgetIdSet.has(selectedWidgetId)
          ? selectedWidgetId
          : defaults.selection?.widgetId ?? null
    },
    updatedAt: asString(source.updatedAt, defaults.updatedAt)
  }
}

function normalizeWidgetState(raw: unknown, index: number): WidgetState | null {
  const source = isObject(raw) ? raw : {}
  const props = isObject(source.props) ? source.props : {}
  const type = asString(source.type)

  if (!isOneOf(type, WIDGET_TYPES)) {
    return null
  }

  const base = {
    id: asString(source.id, createId('widget')),
    position: {
      x: asNumber(source.position && isObject(source.position) ? source.position.x : undefined, 40 + index * 18),
      y: asNumber(source.position && isObject(source.position) ? source.position.y : undefined, 40 + index * 18)
    },
    size: clampWidgetSize({
      w: asNumber(source.size && isObject(source.size) ? source.size.w : undefined, DEFAULT_WIDGET_WIDTH),
      h: asNumber(source.size && isObject(source.size) ? source.size.h : undefined, DEFAULT_WIDGET_HEIGHT)
    }),
    zIndex: asNumber(source.zIndex, index + 1),
    isCollapsed: asBoolean(source.isCollapsed, false)
  }

  if (type === 'ask') {
    return {
      ...base,
      type: 'ask',
      props: {
        mode: props.mode === 'custom' ? 'custom' : 'template',
        linkedQaRecordId: asOptionalString(props.linkedQaRecordId),
        pendingSession: normalizePendingAskSession(props.pendingSession),
        draftPrompt: asOptionalString(props.draftPrompt),
        contextPreview: normalizeContextPreview(props.contextPreview),
        requestState: isOneOf(props.requestState, REQUEST_STATES) ? props.requestState : 'idle'
      }
    }
  }

  if (type === 'qa-record') {
    const qaRecordId = asOptionalString(props.qaRecordId)
    if (!qaRecordId) {
      return null
    }
    return {
      ...base,
      type: 'qa-record',
      props: {
        qaRecordId
      }
    }
  }

  return null
}

function reconcileCanvas(canvas: CanvasState, qaRecords: QARecord[]): CanvasState {
  const activeRecords = qaRecords.filter((record) => !record.lifecycle.isDeleted)
  const activeRecordIds = new Set(activeRecords.map((record) => record.id))
  const activeRecordMap = new Map(activeRecords.map((record) => [record.id, record]))
  const widgetStates = canvas.widgetStates.flatMap<WidgetState>((widget) => {
    if (widget.type === 'qa-record') {
      return activeRecordIds.has(widget.props.qaRecordId) ? [widget] : []
    }

    const linkedRecord = widget.props.linkedQaRecordId
      ? activeRecordMap.get(widget.props.linkedQaRecordId) ?? null
      : null

    if (linkedRecord) {
      return [
        {
          ...widget,
          type: 'qa-record',
          props: {
            qaRecordId: linkedRecord.id
          }
        }
      ]
    }

    if (widget.props.pendingSession) {
      return [widget]
    }

    return linkedRecord ? [widget] : []
  })
  const widgetIdSet = new Set(widgetStates.map((widget) => widget.id))
  const selectedWidgetId = canvas.selection?.widgetId ?? null

  return {
    ...canvas,
    widgetStates,
    selection: {
      widgetId: selectedWidgetId && widgetIdSet.has(selectedWidgetId) ? selectedWidgetId : null
    }
  }
}

function normalizeContextPreview(raw: unknown) {
  if (!isObject(raw)) {
    return undefined
  }

  return {
    statePrompt: asString(raw.statePrompt),
    readingContext: asString(raw.readingContext),
    readingContextMode: normalizeReadingContextMode(raw.readingContextMode, raw.readingContext, 'reader'),
    selectedText: asString(raw.selectedText)
  }
}

function normalizePendingAskSession(raw: unknown) {
  if (!isObject(raw)) {
    return undefined
  }

  const action = normalizeAskAction(raw.action)
  if (!action) {
    return undefined
  }

  return {
    id: asString(raw.id, createId('ask-session')),
    action,
    createdAt: asString(raw.createdAt, new Date().toISOString())
  }
}

function normalizeAskAction(raw: unknown): AskAction | null {
  if (!isObject(raw)) {
    return null
  }

  const target = isObject(raw.target) ? raw.target : {}
  const selection = isObject(raw.selection) ? raw.selection : {}
  const surface = isOneOf(raw.surface, SURFACE_TYPES) ? raw.surface : 'reader'
  const selectionKind = isOneOf(selection.kind, SELECTED_TEXT_KINDS) ? selection.kind : undefined
  const selectedText =
    selectionKind === 'math'
      ? getMathDisplayText({
          text: asString(selection.text),
          kind: selectionKind,
          mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
          mathAnchorLatex: asOptionalString(selection.mathAnchorLatex),
          mathDisplayText: asOptionalString(selection.mathDisplayText)
        })
      : asString(selection.text)

  if (!selectedText) {
    return null
  }

  return {
    surface,
    target: {
      documentId: asOptionalString(target.documentId),
      widgetId: asOptionalString(target.widgetId),
      sidebarNodeId: asOptionalString(target.sidebarNodeId),
      sidebarNodeType: isOneOf(target.sidebarNodeType, SIDEBAR_NODE_TYPES) ? target.sidebarNodeType : undefined,
      sidebarLabel: asOptionalString(target.sidebarLabel)
    },
    selection: {
      text: selectedText,
      kind: selectionKind,
      anchorFrom: asOptionalNumber(selection.anchorFrom),
      anchorTo: asOptionalNumber(selection.anchorTo),
      startOffset: asOptionalNumber(selection.startOffset),
      endOffset: asOptionalNumber(selection.endOffset),
      startPath: asOptionalString(selection.startPath),
      endPath: asOptionalString(selection.endPath),
      mathNodeId: asOptionalString(selection.mathNodeId),
      mathMode: selection.mathMode === 'inline' || selection.mathMode === 'block' ? selection.mathMode : undefined,
      mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
      mathAnchorLatex: asOptionalString(selection.mathAnchorLatex) ?? asOptionalString(selection.mathSelectionLatex),
      mathDisplayText:
        asOptionalString(selection.mathDisplayText) ??
        (selectionKind === 'math'
          ? getMathDisplayText({
              text: selectedText,
              kind: selectionKind,
              mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
              mathAnchorLatex: asOptionalString(selection.mathAnchorLatex)
            }) || undefined
          : undefined),
      mathPromptText:
        asOptionalString(selection.mathPromptText) ??
        (selectionKind === 'math'
          ? getMathPromptText({
              text: selectedText,
              kind: selectionKind,
              mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
              mathAnchorLatex: asOptionalString(selection.mathAnchorLatex)
            }) || undefined
          : undefined),
      mathSelectionPath: asOptionalString(selection.mathSelectionPath),
      mathSelectionFrom: asOptionalNumber(selection.mathSelectionFrom),
      mathSelectionTo: asOptionalNumber(selection.mathSelectionTo),
      mathAnchorVersion: selection.mathAnchorVersion === 'mathlive-v1' ? 'mathlive-v1' : undefined,
      widgetContentPath: asOptionalString(selection.widgetContentPath),
      contextPrefix: asOptionalString(selection.contextPrefix),
      contextSuffix: asOptionalString(selection.contextSuffix),
      surfaceText: asOptionalString(selection.surfaceText),
      anchorQuote: asOptionalString(selection.anchorQuote),
      preferredMarkerType:
        selection.preferredMarkerType === 'bracket'
          ? 'bracket'
          : selection.preferredMarkerType === 'underline'
            ? 'underline'
            : undefined
    },
    contextMode: isOneOf(raw.contextMode, CONTEXT_MODES) ? raw.contextMode : undefined,
    templateId: asOptionalString(raw.templateId),
    customPrompt: asOptionalString(raw.customPrompt),
    learningPrompt: asOptionalString(raw.learningPrompt),
    surfaceTitle: asOptionalString(raw.surfaceTitle),
    sourceQaRecordId: asOptionalString(raw.sourceQaRecordId),
    menuPoint: {
      x: asNumber(isObject(raw.menuPoint) ? raw.menuPoint.x : undefined, 0),
      y: asNumber(isObject(raw.menuPoint) ? raw.menuPoint.y : undefined, 0)
    }
  }
}

function normalizeQaRecord(raw: unknown, config: AppConfig): QARecord | null {
  if (!isObject(raw)) {
    return null
  }

  const sourceSurface = normalizeSurface(raw.sourceSurface, raw.anchor)
  const sourceDocumentId = asOptionalString(raw.sourceDocumentId)
  const sourceWidgetId = asOptionalString(raw.sourceWidgetId)
  const sourceSidebarNodeId = asOptionalString(raw.sourceSidebarNodeId)
  const rawSelectedText =
    asString(raw.selectedText) || (isObject(raw.anchor) ? asString(raw.anchor.quote) : '') || asString(raw.questionText)
  const selectedTextKind = isOneOf(raw.selectedTextKind, SELECTED_TEXT_KINDS) ? raw.selectedTextKind : undefined
  const customPromptBody = asOptionalString(raw.customPromptBody)
  const promptTemplateId = asOptionalString(raw.promptTemplateId)
  const template = promptTemplateId ? config.templates.find((candidate) => candidate.id === promptTemplateId) ?? null : null
  const promptIntent = isOneOf(raw.promptIntent, PROMPT_INTENTS)
    ? raw.promptIntent
    : inferPromptIntent(template, customPromptBody)
  const readingContextMode = normalizeReadingContextMode(raw.readingContextMode, raw.readingContextSnapshot, sourceSurface)
  const readingContextSnapshot = normalizeReadingContextSnapshot(raw.readingContextSnapshot)
  const questionText =
    asString(raw.questionText) || customPromptBody || resolveTemplateBody(promptTemplateId, config.templates) || extractQuestionText(raw.fullPrompt)
  const systemStatePrompt = asString(raw.systemStatePrompt)
  const anchor = normalizeAnchor(raw.anchor, {
    sourceSurface,
    sourceDocumentId,
    sourceWidgetId,
    sourceSidebarNodeId,
    selectedText: rawSelectedText
  })

  if (!anchor) {
    return null
  }

  const selectedText =
    selectedTextKind === 'math'
      ? getMathDisplayText({
          text: rawSelectedText,
          kind: selectedTextKind,
          mathSelectionLatex: anchor.mathSelectionLatex,
          mathAnchorLatex: anchor.mathAnchorLatex,
          mathDisplayText: anchor.mathDisplayText
        }) || rawSelectedText
      : rawSelectedText

  return {
    id: asString(raw.id, createId('qa')),
    sourceSurface,
    sourceDocumentId,
    sourceWidgetId,
    sourceSidebarNodeId,
    anchor,
    parentQaRecordId: asOptionalString(raw.parentQaRecordId),
    rootQaRecordId: asOptionalString(raw.rootQaRecordId),
    selectedText,
    selectedTextKind,
    promptTemplateId,
    promptIntent,
    customPromptTitle: asOptionalString(raw.customPromptTitle),
    customPromptBody,
    systemStatePrompt,
    readingContextMode,
    readingContextSnapshot,
    fullPrompt:
      asString(raw.fullPrompt) ||
      buildFullPrompt({
        systemStatePrompt,
        contextMode: readingContextMode,
        contextSnapshot: readingContextSnapshot,
        questionText,
        selectedText,
        promptSelectionText:
          selectedTextKind === 'math'
            ? (() => {
                const promptText =
                  getMathPromptText({
                    text: selectedText,
                    kind: selectedTextKind,
                    mathSelectionLatex: anchor.mathSelectionLatex,
                    mathAnchorLatex: anchor.mathAnchorLatex,
                    mathPromptText: anchor.mathPromptText
                  }) || undefined
                return promptText && promptText !== selectedText ? promptText : undefined
              })()
            : undefined
      }),
    questionText,
    answerMarkdown: asString(raw.answerMarkdown),
    answerStatus: isOneOf(raw.answerStatus, ANSWER_STATUSES)
      ? raw.answerStatus
      : asString(raw.answerMarkdown)
        ? 'done'
        : questionText
          ? 'pending'
          : 'aborted',
    modelInfo: normalizeModelInfo(raw.modelInfo),
    timing: normalizeTiming(raw.timing),
    visualStyle: normalizeVisualStyle(raw.visualStyle),
    lifecycle: normalizeLifecycle(raw.lifecycle),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    updatedAt: asString(raw.updatedAt, new Date().toISOString())
  }
}

function normalizeReadingContextMode(
  rawMode: unknown,
  rawSnapshot: unknown,
  sourceSurface: QARecord['sourceSurface']
): ReadingContextMode {
  if (isOneOf(rawMode, CONTEXT_MODES)) {
    return rawMode
  }

  if (isObject(rawSnapshot) && isOneOf(rawSnapshot.mode, CONTEXT_MODES)) {
    return rawSnapshot.mode
  }

  if (sourceSurface === 'widget') {
    return 'widget-local'
  }
  if (sourceSurface === 'sidebar') {
    return 'sidebar-node'
  }
  return 'section'
}

function normalizeReadingContextSnapshot(rawSnapshot: unknown) {
  if (typeof rawSnapshot === 'string') {
    return rawSnapshot
  }

  if (isObject(rawSnapshot)) {
    return asString(rawSnapshot.textSnapshot)
  }

  return ''
}

function normalizeAnchor(
  raw: unknown,
  context: {
    sourceSurface: QARecord['sourceSurface']
    sourceDocumentId?: string
    sourceWidgetId?: string
    sourceSidebarNodeId?: string
    selectedText: string
  }
): EmbeddedAnchor | null {
  const source = isObject(raw) ? raw : {}
  const target = normalizeAnchorTarget(source.target, context)

  if (!target) {
    return null
  }

  const anchorFrom = asOptionalNumber(source.anchorFrom)
  const anchorTo = asOptionalNumber(source.anchorTo)
  const startOffset = asOptionalNumber(source.startOffset)
  const endOffset = asOptionalNumber(source.endOffset)
  const quote = asOptionalString(source.quote) ?? (context.selectedText || undefined)
  const quoteHash = asOptionalString(source.quoteHash) ?? hashString(quote ?? context.selectedText)
  const hasMathAnchor = Boolean(
    asOptionalString(source.mathNodeId) ||
      asOptionalString(source.mathSelectionLatex) ||
      asOptionalString(source.mathAnchorLatex) ||
      asOptionalString(source.mathDisplayText)
  )
  const mathSelectionLatex = asOptionalString(source.mathSelectionLatex)
  const mathAnchorLatex = asOptionalString(source.mathAnchorLatex) ?? mathSelectionLatex
  const mathDisplayText =
    asOptionalString(source.mathDisplayText) ??
    ((hasMathAnchor
      ? getMathDisplayText({
          text: quote ?? context.selectedText,
          kind: 'math',
          mathSelectionLatex,
          mathAnchorLatex
        })
      : '') ||
      undefined)
  const mathPromptText =
    asOptionalString(source.mathPromptText) ??
    ((hasMathAnchor
      ? getMathPromptText({
          text: quote ?? context.selectedText,
          kind: 'math',
          mathSelectionLatex,
          mathAnchorLatex
        })
      : '') ||
      undefined)
  const fingerprintSelectedText =
    asOptionalString(source.mathNodeId) && asOptionalString(source.mathSelectionPath)
      ? mathDisplayText ?? context.selectedText
      : context.selectedText

  return {
    id: asString(source.id, createId('anchor')),
    target,
    quote,
    quoteHash,
    anchorFrom,
    anchorTo,
    startOffset,
    endOffset,
    startPath: asOptionalString(source.startPath),
    endPath: asOptionalString(source.endPath),
    mathNodeId: asOptionalString(source.mathNodeId),
    mathMode: source.mathMode === 'inline' || source.mathMode === 'block' ? source.mathMode : undefined,
    mathSelectionLatex,
    mathAnchorLatex,
    mathDisplayText,
    mathPromptText,
    mathSelectionPath: asOptionalString(source.mathSelectionPath),
    mathSelectionFrom: asOptionalNumber(source.mathSelectionFrom),
    mathSelectionTo: asOptionalNumber(source.mathSelectionTo),
    mathAnchorVersion: source.mathAnchorVersion === 'mathlive-v1' ? 'mathlive-v1' : undefined,
    contextPrefix: asOptionalString(source.contextPrefix),
    contextSuffix: asOptionalString(source.contextSuffix),
    isRange: asBoolean(source.isRange, startOffset !== endOffset),
    anchorFingerprint: asString(
      source.anchorFingerprint,
      buildAnchorFingerprint({
        target,
        selectedText: fingerprintSelectedText,
        quoteHash,
        anchorFrom,
        anchorTo,
        startOffset,
        endOffset,
        startPath: asOptionalString(source.startPath),
        endPath: asOptionalString(source.endPath),
        mathNodeId: asOptionalString(source.mathNodeId),
        mathSelectionPath: asOptionalString(source.mathSelectionPath)
      })
    ),
    selectorVersion: asString(source.selectorVersion, CURRENT_SELECTOR_VERSION)
  }
}

function normalizeAnchorTarget(
  raw: unknown,
  context: {
    sourceSurface: QARecord['sourceSurface']
    sourceDocumentId?: string
    sourceWidgetId?: string
    sourceSidebarNodeId?: string
  }
): EmbeddedAnchor['target'] | null {
  const source = isObject(raw) ? raw : {}
  const surface = normalizeSurface(source.surface, null, context.sourceSurface)

  if (surface === 'reader') {
    const documentId = asString(source.documentId, context.sourceDocumentId ?? '')
    if (!documentId) {
      return null
    }
    return {
      surface: 'reader',
      documentId,
      blockId: asOptionalString(source.blockId)
    }
  }

  if (surface === 'widget') {
    const widgetId = asOptionalString(source.widgetId) ?? context.sourceWidgetId
    const sourceQaRecordId = asOptionalString(source.sourceQaRecordId)
    if (!widgetId && !sourceQaRecordId) {
      return null
    }
    return {
      surface: 'widget',
      canvasId: asString(source.canvasId, MAIN_CANVAS_ID),
      widgetId: widgetId ?? `qa-record:${sourceQaRecordId}`,
      sourceQaRecordId,
      widgetContentPath: asOptionalString(source.widgetContentPath)
    }
  }

  return {
    surface: 'sidebar',
    repoId: asString(source.repoId, DEMO_REPO_ID),
    nodeId: asString(source.nodeId, context.sourceSidebarNodeId ?? DEMO_REPO_ID),
    nodeType: isOneOf(source.nodeType, SIDEBAR_NODE_TYPES) ? source.nodeType : 'document'
  }
}

function normalizeModelInfo(raw: unknown) {
  if (!isObject(raw)) {
    return undefined
  }

  const provider = asOptionalString(raw.provider)
  const model = asOptionalString(raw.model)
  if (!provider || !model) {
    return undefined
  }

  return {
    provider,
    displayName: asOptionalString(raw.displayName),
    model,
    temperature: asOptionalNumber(raw.temperature),
    modelId: asOptionalString(raw.modelId),
    cost: asOptionalNumber(raw.cost),
    remainingCredits: asOptionalNumber(raw.remainingCredits)
  }
}

function normalizeTiming(raw: unknown) {
  const source = isObject(raw) ? raw : {}

  return {
    requestedAt: asString(source.requestedAt, new Date().toISOString()),
    firstTokenAt: asOptionalString(source.firstTokenAt),
    completedAt: asOptionalString(source.completedAt),
    durationMs: asOptionalNumber(source.durationMs)
  }
}

function normalizeVisualStyle(raw: unknown) {
  const source = isObject(raw) ? raw : {}

  return {
    color: asString(source.color, '#5f4b32'),
    markerType: isOneOf(source.markerType, MARKER_TYPES) ? source.markerType : 'underline',
    isMergedEntry: asOptionalBoolean(source.isMergedEntry)
  }
}

function normalizeLifecycle(raw: unknown) {
  const source = isObject(raw) ? raw : {}

  return {
    isDeleted: asBoolean(source.isDeleted, false),
    deletedAt: asOptionalString(source.deletedAt)
  }
}

function normalizeSurface(rawSurface: unknown, rawAnchor: unknown, fallback: QARecord['sourceSurface'] = 'reader'): QARecord['sourceSurface'] {
  if (isOneOf(rawSurface, SURFACE_TYPES)) {
    return rawSurface
  }

  if (isObject(rawAnchor) && isObject(rawAnchor.target) && isOneOf(rawAnchor.target.surface, SURFACE_TYPES)) {
    return rawAnchor.target.surface
  }

  return fallback
}

function resolveTemplateBody(promptTemplateId: string | undefined, templates: PromptTemplate[]) {
  return templates.find((template) => template.id === promptTemplateId)?.body ?? ''
}

function extractQuestionText(fullPrompt: unknown) {
  const prompt = asString(fullPrompt)
  if (!prompt) {
    return ''
  }

  const match = prompt.match(/提问：\s*([\s\S]*?)\n\s*被选中的文本：/)
  return match?.[1]?.trim() ?? ''
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

function sortMountedVaultEntries(left: { name: string; isDir: boolean }, right: { name: string; isDir: boolean }) {
  if (left.isDir !== right.isDir) {
    return left.isDir ? -1 : 1
  }

  return left.name.localeCompare(right.name, 'zh-Hans-CN')
}

function shouldIgnoreMountedVaultDirectory(name: string) {
  return name.startsWith('.') || IGNORED_MOUNTED_VAULT_DIRECTORIES.has(name.toLowerCase())
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

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>
) {
  if (items.length === 0) {
    return [] as TOutput[]
  }

  const results = new Array<TOutput>(items.length)
  let nextIndex = 0
  const workerCount = Math.max(1, Math.min(concurrency, items.length))

  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (true) {
        const currentIndex = nextIndex
        nextIndex += 1
        if (currentIndex >= items.length) {
          return
        }

        results[currentIndex] = await mapper(items[currentIndex], currentIndex)
      }
    })
  )

  return results
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
  return (
    (preferredPath
      ? documents.find((document) => document.path === preferredPath || document.id === preferredPath) ?? null
      : null) ?? documents[0]
  )
}

function normalizeMountedVaultPath(path: string | undefined) {
  return typeof path === 'string' && path.trim().length > 0 ? path.trim() : undefined
}

function basenameFromAnyPath(path: string) {
  const normalized = path.replace(/\\/g, '/').split('/').filter(Boolean)
  return normalized[normalized.length - 1] ?? ''
}

function isObject(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isOneOf<T extends readonly string[]>(value: unknown, options: T): value is T[number] {
  return typeof value === 'string' && options.includes(value)
}

function asString(value: unknown, fallback = '') {
  return typeof value === 'string' ? value : fallback
}

function asOptionalString(value: unknown) {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function asOptionalNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asBoolean(value: unknown, fallback = false) {
  return typeof value === 'boolean' ? value : fallback
}

function asOptionalBoolean(value: unknown) {
  return typeof value === 'boolean' ? value : undefined
}
