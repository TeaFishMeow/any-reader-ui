import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { HeaderPreferenceControls } from './components/HeaderPreferenceControls'
import { MarkdownSurface } from './components/MarkdownSurface'
import { SidebarTree } from './components/SidebarTree'
import { CURRENT_SELECTOR_VERSION, buildAnchorFingerprint } from './lib/app-helpers'
import { defaultAppConfig } from './lib/defaults'
import { createId, hashString, markdownToPlainText, truncateText } from './lib/text'
import { basenameVaultPath, dirnameVaultPath } from './lib/vault-paths'
import type {
  AnchorTarget,
  AppConfig,
  AskSelection,
  DocumentNode,
  QARecord,
  RepoMeta,
  SidebarNode
} from './types/domain'

const LOCAL_VAULT_PATH = 'any-reader-ui-local-vault'
const LOCAL_REPO_ID = 'local-vault'
const PREFERRED_INITIAL_DOCUMENT = '第10章 重积分/10.2 二重积分的计算，曲面的面积/10.2.1 利用直角坐标计算二重积分.md'

interface VaultManifestDocument {
  path: string
  title: string
  parentPath: string | null
  order: number
  level: number
  contentMd: string
  contentVersion: string
  contentPlainText: string
}

interface VaultManifest {
  vaultName: string
  vaultDir: string
  generatedAt: string
  documents: VaultManifestDocument[]
  folderPaths: string[]
}

type WorkspaceStyle = CSSProperties & {
  '--left-pane-size'?: string
  '--right-pane-size'?: string
  '--left-splitter-size'?: string
  '--right-splitter-size'?: string
}

const annotationColors = ['#146b5d', '#8758a5', '#b14c32', '#2f5f9f', '#8a6d18']

function markdownStartsWithHeading(markdown: string) {
  const firstNonEmptyLine = markdown
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)

  return Boolean(firstNonEmptyLine && /^#(?:\s|$)/.test(firstNonEmptyLine.trimStart()))
}

function createUiConfig(): AppConfig {
  const config = defaultAppConfig()
  return {
    ...config,
    layout: {
      ...config.layout,
      leftSidebarWidth: 318,
      rightSidebarWidth: 390,
      rightSidebarCollapsed: false
    },
    rendering: {
      ...config.rendering,
      readerFontPx: 17,
      widgetFontPx: 15
    },
    repository: {
      ...config.repository,
      sourceMode: 'mounted-vault',
      mountedVaultPath: LOCAL_VAULT_PATH
    }
  }
}

function toDocumentNode(item: VaultManifestDocument): DocumentNode {
  return {
    id: item.path,
    repoId: LOCAL_REPO_ID,
    path: item.path,
    title: item.title,
    parentId: item.parentPath,
    childrenIds: [],
    order: item.order,
    level: item.level,
    contentMd: item.contentMd,
    isContentLoaded: true,
    contentVersion: item.contentVersion,
    contentPlainText: item.contentPlainText || markdownToPlainText(item.contentMd),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
}

function resolveSidebarParentId(parentPath: string | null | undefined, repoId: string, documentIdByPath: Map<string, string>) {
  if (!parentPath) {
    return repoId
  }

  return documentIdByPath.get(parentPath) ?? `folder:${parentPath}`
}

function sortSidebarNodes(left: SidebarNode, right: SidebarNode) {
  if (left.type !== right.type) {
    return left.type === 'folder' ? -1 : 1
  }
  if (left.order !== right.order) {
    return left.order - right.order
  }
  return left.label.localeCompare(right.label, 'zh-Hans-CN')
}

function buildSidebarNodes(repo: RepoMeta, documents: DocumentNode[], folderPaths: string[]) {
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

  const pushChild = (parentId: string, node: SidebarNode) => {
    childBuckets.set(parentId, [...(childBuckets.get(parentId) ?? []), node])
  }

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
    pushChild(node.parentId ?? repo.id, node)
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
    pushChild(node.parentId ?? repo.id, node)
  }

  for (const [parentId, children] of childBuckets.entries()) {
    const parentNode = nodesById.get(parentId)
    if (!parentNode) {
      continue
    }
    parentNode.childrenIds = [...children].sort(sortSidebarNodes).map((child) => child.id)
  }

  return [repoNode, ...[...nodesById.values()].filter((node) => node.id !== repo.id)]
}

function chooseInitialDocument(documents: DocumentNode[]) {
  return (
    documents.find((document) => document.path === PREFERRED_INITIAL_DOCUMENT) ??
    documents.find((document) => !document.path.endsWith('/index.md')) ??
    documents[0] ??
    null
  )
}

function createRepo(manifest: VaultManifest, currentDocumentId: string): RepoMeta {
  const timestamp = new Date().toISOString()
  return {
    id: LOCAL_REPO_ID,
    title: manifest.vaultName || '微积分二层次下',
    rootDocumentIds: manifest.documents.filter((document) => document.parentPath === null).map((document) => document.path),
    currentDocumentId,
    sourceMode: 'mounted-vault',
    mountedVaultPath: LOCAL_VAULT_PATH,
    createdAt: timestamp,
    updatedAt: timestamp
  }
}

function buildAnchorTarget(action: AskSelection, fallbackDocumentId: string, repoId: string): AnchorTarget {
  if (action.surface === 'sidebar') {
    return {
      surface: 'sidebar',
      repoId,
      nodeId: action.target.sidebarNodeId ?? repoId,
      nodeType: action.target.sidebarNodeType ?? 'document'
    }
  }

  if (action.surface === 'widget') {
    return {
      surface: 'widget',
      canvasId: 'ui-canvas',
      widgetId: action.target.widgetId ?? 'ui-widget'
    }
  }

  return {
    surface: 'reader',
    documentId: action.target.documentId ?? fallbackDocumentId
  }
}

function createDraftRecord(args: {
  action: AskSelection
  documentId: string
  repoId: string
  color: string
  documentTitle: string
}) {
  const { action, color, documentId, documentTitle, repoId } = args
  const createdAt = new Date().toISOString()
  const selectedText =
    action.selection.kind === 'math'
      ? action.selection.mathDisplayText ?? action.selection.text
      : action.selection.text || action.surfaceTitle || '未命名摘录'
  const quote = action.selection.anchorQuote ?? selectedText
  const quoteHash = hashString(quote)
  const target = buildAnchorTarget(action, documentId, repoId)
  const context = [action.selection.contextPrefix, action.selection.contextSuffix].filter(Boolean).join('\n...\n')
  const answerMarkdown = [
    '### UI 草稿',
    '',
    '这里会承载接口接入后的解释、追问、错题订正或学习笔记。',
    '',
    context ? `> ${truncateText(context.replace(/\s+/g, ' ').trim(), 220)}` : '',
    '',
    `来源：${documentTitle}`
  ]
    .filter(Boolean)
    .join('\n')

  return {
    id: createId('ui-note'),
    sourceSurface: action.surface,
    sourceDocumentId: action.surface === 'reader' ? documentId : undefined,
    sourceSidebarNodeId: action.surface === 'sidebar' ? action.target.sidebarNodeId : undefined,
    anchor: {
      id: createId('anchor'),
      target,
      quote,
      quoteHash,
      anchorFrom: action.selection.anchorFrom,
      anchorTo: action.selection.anchorTo,
      startOffset: action.selection.startOffset,
      endOffset: action.selection.endOffset,
      startPath: action.selection.startPath,
      endPath: action.selection.endPath,
      mathNodeId: action.selection.mathNodeId,
      mathMode: action.selection.mathMode,
      mathSelectionLatex: action.selection.mathSelectionLatex,
      mathAnchorLatex: action.selection.mathAnchorLatex,
      mathDisplayText: action.selection.mathDisplayText,
      mathPromptText: action.selection.mathPromptText,
      mathSelectionPath: action.selection.mathSelectionPath,
      mathSelectionFrom: action.selection.mathSelectionFrom,
      mathSelectionTo: action.selection.mathSelectionTo,
      mathAnchorVersion: action.selection.mathAnchorVersion,
      contextPrefix: action.selection.contextPrefix,
      contextSuffix: action.selection.contextSuffix,
      isRange: (action.selection.startOffset ?? 0) !== (action.selection.endOffset ?? 0),
      anchorFingerprint: buildAnchorFingerprint({
        target,
        selectedText,
        quoteHash,
        anchorFrom: action.selection.anchorFrom,
        anchorTo: action.selection.anchorTo,
        startOffset: action.selection.startOffset,
        endOffset: action.selection.endOffset,
        startPath: action.selection.startPath,
        endPath: action.selection.endPath,
        mathNodeId: action.selection.mathNodeId,
        mathSelectionPath: action.selection.mathSelectionPath
      }),
      selectorVersion: CURRENT_SELECTOR_VERSION
    },
    selectedText,
    selectedTextKind: action.selection.kind ?? (action.surface === 'sidebar' ? 'node-label' : 'plain'),
    systemStatePrompt: '',
    readingContextMode: action.surface === 'sidebar' ? 'sidebar-node' : 'section',
    readingContextSnapshot: action.selection.surfaceText ?? context,
    fullPrompt: '',
    questionText: action.customPrompt ?? '解释这个片段',
    answerMarkdown,
    answerStatus: 'done',
    timing: {
      requestedAt: createdAt,
      completedAt: createdAt
    },
    visualStyle: {
      color,
      markerType: action.selection.preferredMarkerType ?? 'underline'
    },
    lifecycle: {
      isDeleted: false
    },
    createdAt,
    updatedAt: createdAt
  } satisfies QARecord
}

function findDocumentTitle(documents: DocumentNode[], documentId: string | undefined) {
  if (!documentId) {
    return '目录'
  }
  return documents.find((document) => document.id === documentId)?.title ?? '当前文档'
}

export function LocalReaderApp() {
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState<RepoMeta | null>(null)
  const [documents, setDocuments] = useState<DocumentNode[]>([])
  const [sidebarNodes, setSidebarNodes] = useState<SidebarNode[]>([])
  const [config, setConfig] = useState<AppConfig>(() => createUiConfig())
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<string[]>([])
  const [qaRecords, setQaRecords] = useState<QARecord[]>([])
  const [activeRecordId, setActiveRecordId] = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [leftVisible, setLeftVisible] = useState(true)
  const [rightVisible, setRightVisible] = useState(true)

  useEffect(() => {
    let cancelled = false

    async function loadVault() {
      try {
        const response = await fetch('/vault-manifest.json')
        if (!response.ok) {
          throw new Error(`vault-manifest.json ${response.status}`)
        }

        const manifest = (await response.json()) as VaultManifest
        const nextDocuments = manifest.documents.map(toDocumentNode)
        const initialDocument = chooseInitialDocument(nextDocuments)
        if (!initialDocument) {
          throw new Error('微积分二层次下目录中没有可读取的 Markdown 文件')
        }

        const nextRepo = createRepo(manifest, initialDocument.id)
        if (cancelled) {
          return
        }

        setDocuments(nextDocuments)
        setRepo(nextRepo)
        setSidebarNodes(buildSidebarNodes(nextRepo, nextDocuments, manifest.folderPaths))
        setLoading(false)
      } catch (nextError) {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError.message : '读取本地目录失败')
          setLoading(false)
        }
      }
    }

    void loadVault()

    return () => {
      cancelled = true
    }
  }, [])

  const currentDocument = useMemo(() => {
    if (!repo) {
      return null
    }
    return documents.find((document) => document.id === repo.currentDocumentId) ?? documents[0] ?? null
  }, [documents, repo])

  const activeRecords = useMemo(() => qaRecords.filter((record) => !record.lifecycle.isDeleted), [qaRecords])
  const activeRecord = activeRecords.find((record) => record.id === activeRecordId) ?? activeRecords.at(-1) ?? null
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return []
    }
    return documents
      .filter((document) => `${document.title} ${document.path}`.toLowerCase().includes(query))
      .slice(0, 24)
  }, [documents, searchQuery])

  const workspaceStyle: WorkspaceStyle = {
    '--left-pane-size': leftVisible ? `${config.layout.leftSidebarWidth}px` : '0px',
    '--right-pane-size': rightVisible ? `${config.layout.rightSidebarWidth}px` : '0px',
    '--left-splitter-size': '0px',
    '--right-splitter-size': '0px'
  }

  function openDocument(documentId: string) {
    setRepo((previous) => (previous ? { ...previous, currentDocumentId: documentId, updatedAt: new Date().toISOString() } : previous))
  }

  function toggleSidebarFolder(folderId: string) {
    setCollapsedFolderIds((previous) =>
      previous.includes(folderId) ? previous.filter((candidate) => candidate !== folderId) : [...previous, folderId]
    )
  }

  function handleAsk(action: AskSelection) {
    if (!repo || !currentDocument) {
      return
    }

    const sourceDocumentId = action.target.documentId ?? currentDocument.id
    const record = createDraftRecord({
      action,
      documentId: sourceDocumentId,
      repoId: repo.id,
      color: annotationColors[qaRecords.length % annotationColors.length],
      documentTitle: findDocumentTitle(documents, sourceDocumentId)
    })
    setQaRecords((previous) => [...previous, record])
    setActiveRecordId(record.id)
    setRightVisible(true)
  }

  function adjustReaderFont(delta: number) {
    setConfig((previous) => ({
      ...previous,
      rendering: {
        ...previous.rendering,
        readerFontPx: Math.max(13, Math.min(24, previous.rendering.readerFontPx + delta))
      }
    }))
  }

  function deleteActiveRecord() {
    if (!activeRecord) {
      return
    }
    setQaRecords((previous) =>
      previous.map((record) =>
        record.id === activeRecord.id
          ? {
              ...record,
              lifecycle: {
                isDeleted: true,
                deletedAt: new Date().toISOString()
              },
              updatedAt: new Date().toISOString()
            }
          : record
      )
    )
    setActiveRecordId(null)
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card local-boot-card">
          <span className="boot-kicker">AnyReader UI</span>
          <h1>正在读取本地教材目录</h1>
          <p>数据源：D:\ExWorld\Machine\any-reader\any-reader-ui\微积分二层次下</p>
        </div>
      </div>
    )
  }

  if (error || !repo || !currentDocument) {
    return (
      <div className="boot-screen">
        <div className="boot-card error-card local-boot-card">
          <span className="boot-kicker">AnyReader UI</span>
          <h1>读取失败</h1>
          <p>{error ?? '缺少可显示的本地文档'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="app-shell local-reader-shell">
      <header className="app-topbar local-topbar">
        <div className="topbar-brand">
          <span className="topbar-mark local-topbar-mark">AnyReader</span>
          <div className="topbar-copy">
            <div className="topbar-title-row">
              <strong>{repo.title}</strong>
              <span className="demo-badge mounted-badge">本地 UI 草稿</span>
            </div>
            <span>{currentDocument.path}</span>
          </div>
        </div>

        <div className="topbar-actions local-topbar-actions">
          <button className="ghost-button" type="button" onClick={() => setLeftVisible((visible) => !visible)}>
            {leftVisible ? '隐藏目录' : '显示目录'}
          </button>
          <button className="ghost-button" type="button" onClick={() => setRightVisible((visible) => !visible)}>
            {rightVisible ? '隐藏草稿' : '显示草稿'}
          </button>
          <button className="icon-button local-font-button" type="button" aria-label="缩小字号" onClick={() => adjustReaderFont(-1)}>
            A-
          </button>
          <button className="icon-button local-font-button" type="button" aria-label="放大字号" onClick={() => adjustReaderFont(1)}>
            A+
          </button>
          <HeaderPreferenceControls className="topbar-preference-controls" />
        </div>
      </header>

      <div className="workspace-grid local-workspace-grid" style={workspaceStyle}>
        {leftVisible ? (
          <aside className="workspace-pane sidebar left-pane local-left-pane">
            <div className="local-sidebar-header">
              <span className="pane-label">Library</span>
              <label className="local-search-field">
                <span>搜索</span>
                <input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="章节、试卷、习题"
                />
              </label>
            </div>
            {searchResults.length > 0 ? (
              <div className="local-search-results">
                {searchResults.map((document) => (
                  <button
                    key={document.id}
                    type="button"
                    className={`local-search-result ${document.id === currentDocument.id ? 'active' : ''}`}
                    onClick={() => openDocument(document.id)}
                  >
                    <strong>{document.title}</strong>
                    <span>{document.path}</span>
                  </button>
                ))}
              </div>
            ) : (
              <SidebarTree
                repo={repo}
                nodes={sidebarNodes}
                documents={documents}
                collapsedFolderIds={collapsedFolderIds}
                currentDocumentId={currentDocument.id}
                onOpenDocument={openDocument}
                onToggleFolder={toggleSidebarFolder}
                onAsk={handleAsk}
              />
            )}
          </aside>
        ) : null}

        <main className="workspace-pane reader-pane local-reader-pane">
          <div className="reader-scroll local-reader-scroll">
            {!markdownStartsWithHeading(currentDocument.contentMd) ? (
              <header className="reader-article-header">
                <h1 className="reader-article-title">{currentDocument.title}</h1>
              </header>
            ) : null}
            <MarkdownSurface
              markdown={currentDocument.contentMd}
              qaRecords={activeRecords}
              config={config}
              surface="reader"
              documentId={currentDocument.id}
              documentPath={currentDocument.path}
              documents={documents}
              mountedVaultPath={LOCAL_VAULT_PATH}
              surfaceTitle={currentDocument.title}
              onAsk={handleAsk}
              onOpenRecord={setActiveRecordId}
              onOpenGroup={(recordIds) => setActiveRecordId(recordIds[0] ?? null)}
              onOpenDocument={openDocument}
            />
          </div>
        </main>

        {rightVisible ? (
          <aside className="workspace-pane sidebar right-pane local-right-pane">
            <div className="local-right-header">
              <div>
                <span className="pane-label">Draft</span>
                <h2>问答与批注草稿</h2>
              </div>
              <span className="local-count-pill">{activeRecords.length}</span>
            </div>

            <div className="local-right-body">
              {activeRecord ? (
                <article className="local-record-detail">
                  <span className="local-record-source">{findDocumentTitle(documents, activeRecord.sourceDocumentId)}</span>
                  <h3>{truncateText(activeRecord.selectedText.replace(/\s+/g, ' '), 96)}</h3>
                  <div className="local-answer-preview">
                    <MarkdownSurface
                      markdown={activeRecord.answerMarkdown}
                      qaRecords={activeRecords}
                      config={config}
                      surface="widget"
                      fontScope="widget"
                      documents={documents}
                      mountedVaultPath={LOCAL_VAULT_PATH}
                      surfaceTitle="草稿回答"
                      allowAsk={false}
                      showAnnotations={false}
                      onAsk={handleAsk}
                      onOpenRecord={setActiveRecordId}
                      onOpenGroup={(recordIds) => setActiveRecordId(recordIds[0] ?? null)}
                      onOpenDocument={openDocument}
                    />
                  </div>
                  <div className="local-record-actions">
                    <button className="ghost-button small" type="button" onClick={deleteActiveRecord}>
                      删除草稿
                    </button>
                  </div>
                </article>
              ) : (
                <div className="local-empty-state">
                  <strong>选中文本即可生成右侧草稿</strong>
                  <span>拖选正文中的文字或公式，界面会保留批注位置并在这里显示占位问答。</span>
                </div>
              )}

              {activeRecords.length > 0 ? (
                <div className="local-record-list">
                  {activeRecords
                    .slice()
                    .reverse()
                    .map((record) => (
                      <button
                        key={record.id}
                        type="button"
                        className={`local-record-item ${record.id === activeRecord?.id ? 'active' : ''}`}
                        onClick={() => setActiveRecordId(record.id)}
                      >
                        <span style={{ background: record.visualStyle.color }} />
                        <strong>{truncateText(record.selectedText.replace(/\s+/g, ' '), 42)}</strong>
                      </button>
                    ))}
                </div>
              ) : null}
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}
