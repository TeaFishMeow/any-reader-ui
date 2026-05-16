import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { bootstrapWorkspace, deleteQaRecord, saveQaRecord, saveWorkspaceState } from '../src_original_reference/lib/bootstrap'
import { fetchRemoteDocument } from '../src_original_reference/lib/api'
import { applyPromptTemplateDefaults, MAIN_CANVAS_ID } from '../src_original_reference/lib/defaults'
import { readMountedVaultTextFile } from '../src_original_reference/lib/fs'
import {
  buildPendingAskSession,
  createPendingRecord,
  nextWidgetFrame,
  normalizeCanvasViewport,
  sortTemplates,
  upsertQaRecord
} from '../src_original_reference/lib/app-helpers'
import { buildModelInfo, streamAnswer } from '../src_original_reference/lib/provider'
import { hashString, markdownToPlainText } from '../src_original_reference/lib/text'
import type {
  AppConfig,
  AskAction,
  CanvasState,
  DocumentNode,
  LlmAccessState,
  PromptTemplate,
  QARecord,
  RepoMeta,
  RepositoryBinding,
  SidebarNode,
  WidgetState,
  WorkspaceSnapshot
} from '../src_original_reference/types/domain'
import { AskMenu } from './components/AskMenu'
import { FloatingMenu } from './components/FloatingMenu'
import { Icon, IconButton, Logo } from './components/Icon'
import { QaWidget } from './components/QaWidget'
import { SettingsWindow } from './components/SettingsWindow'
import { Sidebar } from './components/Sidebar'
import { resizeFrame, WindowFrame } from './components/WindowFrame'
import { useI18n } from './i18n'
import {
  DIRECTORY_AUTO_COLLAPSE_WIDTH,
  LEFT_DEFAULT,
  PERSIST_DELAY_MS,
  RAIL_WIDTH,
  READER_AUTO_COLLAPSE_WIDTH,
  READER_WIDTH,
  VIEWPORT_HEIGHT
} from './constants'
import { isAbortError } from './lib/errors'
import { markedRecordIdFromTarget, markdownBlocks, plainContextForDocument, selectionAction, titleForDocument, type MarkdownHighlight } from './lib/markdown'
import { applyTheme, themeMode, themeStyle } from './lib/theme'
import type { AskMenuState, MenuState, ModalName, ResizeFrame } from './types'

function highlightForRecord(record: QARecord): MarkdownHighlight {
  return {
    id: record.id,
    color: record.visualStyle.color,
    anchorFrom: record.anchor.anchorFrom,
    anchorTo: record.anchor.anchorTo
  }
}

const EMPTY_HIGHLIGHTS: MarkdownHighlight[] = []
type ZoomTarget = 'directory' | 'reader' | 'widget'

function fontZoom(value: number, delta: number) {
  return Math.max(10, Math.min(32, value + delta))
}

export function App() {
  const { t } = useI18n()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [repo, setRepo] = useState<RepoMeta | null>(null)
  const [documents, setDocuments] = useState<DocumentNode[]>([])
  const [nodes, setNodes] = useState<SidebarNode[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [canvas, setCanvas] = useState<CanvasState | null>(null)
  const [records, setRecords] = useState<QARecord[]>([])
  const [llmAccess, setLlmAccess] = useState<LlmAccessState | null>(null)
  const [binding, setBinding] = useState<RepositoryBinding | null>(null)
  const [workspaceVersion, setWorkspaceVersion] = useState(0)
  const [askMenu, setAskMenu] = useState<AskMenuState | null>(null)
  const [floatingMenu, setFloatingMenu] = useState<MenuState | null>(null)
  const [modal, setModal] = useState<ModalName>(null)
  const [readerMaximized, setReaderMaximized] = useState(false)
  const [zoomTarget, setZoomTarget] = useState<ZoomTarget>('reader')
  const [directoryFontPx, setDirectoryFontPx] = useState(13)
  const [directoryFrame, setDirectoryFrame] = useState<ResizeFrame>({ x: 0, y: 0, w: LEFT_DEFAULT, h: VIEWPORT_HEIGHT() })
  const [readerFrame, setReaderFrame] = useState<ResizeFrame>({ x: LEFT_DEFAULT, y: 0, w: READER_WIDTH, h: VIEWPORT_HEIGHT() })
  const [settingsFrame, setSettingsFrame] = useState<ResizeFrame>(() => ({
    x: Math.max(36, (window.innerWidth - 820) / 2),
    y: 56,
    w: Math.min(820, window.innerWidth - 72),
    h: Math.min(700, window.innerHeight - 112)
  }))
  const [persistState, setPersistState] = useState<'idle' | 'dirty' | 'saving' | 'error'>('idle')
  const activeRuns = useRef(new Map<string, AbortController>())
  const persistTimer = useRef<number | null>(null)

  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const currentDocument = repo ? documentMap.get(repo.currentDocumentId) ?? documents[0] ?? null : null
  const activeRecords = useMemo(() => records.filter((record) => !record.lifecycle.isDeleted), [records])
  const templates = useMemo(() => sortTemplates(config?.templates ?? []).filter((template) => template.isEnabled), [config])
  const readerHighlights = useMemo<MarkdownHighlight[]>(() => {
    if (!currentDocument) return []
    return activeRecords
      .filter((record) => record.sourceSurface === 'reader' && record.sourceDocumentId === currentDocument.id && record.selectedText && record.visualStyle.markerType !== 'none')
      .map(highlightForRecord)
  }, [activeRecords, currentDocument])
  const widgetHighlights = useMemo(() => {
    const grouped = new Map<string, MarkdownHighlight[]>()
    activeRecords.forEach((record) => {
      if (record.sourceSurface !== 'widget' || !record.selectedText || record.visualStyle.markerType === 'none') return
      const parentId =
        record.parentQaRecordId ??
        (record.anchor.target.surface === 'widget' ? record.anchor.target.sourceQaRecordId : undefined)
      if (!parentId) return
      grouped.set(parentId, [...(grouped.get(parentId) ?? []), highlightForRecord(record)])
    })
    return grouped
  }, [activeRecords])

  const schedulePersist = useCallback((nextConfig: AppConfig | null, nextCanvas: CanvasState | null) => {
    if (!nextConfig || !nextCanvas) return
    if (persistTimer.current) window.clearTimeout(persistTimer.current)
    setPersistState('dirty')
    persistTimer.current = window.setTimeout(async () => {
      setPersistState('saving')
      try {
        const version = await saveWorkspaceState({ config: nextConfig, canvas: nextCanvas, version: workspaceVersion })
        setWorkspaceVersion(version)
        setPersistState('idle')
      } catch (saveError) {
        console.error(saveError)
        setPersistState('error')
      }
    }, nextConfig.storage.autoSaveMs || PERSIST_DELAY_MS)
  }, [workspaceVersion])

  const updateConfig = (updater: (draft: AppConfig) => AppConfig) => {
    setConfig((previous) => {
      if (!previous) return previous
      const next = updater(previous)
      schedulePersist(next, canvas)
      return next
    })
  }

  const updateCanvas = (updater: (draft: CanvasState) => CanvasState, immediate = false) => {
    setCanvas((previous) => {
      if (!previous) return previous
      const next = { ...updater(previous), updatedAt: new Date().toISOString() }
      if (immediate) {
        void saveWorkspaceState({ config: config!, canvas: next, version: workspaceVersion }).catch(console.error)
      } else {
        schedulePersist(config, next)
      }
      return next
    })
  }

  useEffect(() => {
    let cancelled = false
    async function boot() {
      try {
        setLoading(true)
        const snapshot: WorkspaceSnapshot = await bootstrapWorkspace()
        if (cancelled) return
        setRepo(snapshot.repo)
        setDocuments(snapshot.documents)
        setNodes(snapshot.sidebarNodes)
        setConfig({ ...snapshot.config, templates: applyPromptTemplateDefaults(snapshot.config.templates) })
        setDirectoryFrame((frame) => ({
          ...frame,
          w: snapshot.config.layout.leftSidebarWidth || LEFT_DEFAULT,
          h: VIEWPORT_HEIGHT()
        }))
        setReaderFrame((frame) => ({
          ...frame,
          x: snapshot.config.layout.leftSidebarWidth || LEFT_DEFAULT,
          w: snapshot.config.layout.rightSidebarWidth || READER_WIDTH,
          h: VIEWPORT_HEIGHT()
        }))
        setCanvas({ ...snapshot.canvas, viewport: normalizeCanvasViewport(snapshot.canvas.viewport) })
        setRecords(snapshot.qaRecords)
        setLlmAccess(snapshot.llmAccess ?? null)
        setBinding(snapshot.repositoryBinding)
        setWorkspaceVersion(snapshot.workspaceVersion ?? 0)
      } catch (bootError) {
        console.error(bootError)
        setError(bootError instanceof Error ? bootError.message : 'Workspace failed to load')
      } finally {
        setLoading(false)
      }
    }
    void boot()
    return () => {
      cancelled = true
      activeRuns.current.forEach((controller) => controller.abort())
    }
  }, [])

  useEffect(() => {
    if (!config) return
    applyTheme(themeMode(), themeStyle())
  }, [config])

  useEffect(() => {
    if (!config) return
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      if ((event.metaKey || event.ctrlKey) && !event.altKey && ['+', '=', '-', '_', '0'].includes(key)) {
        event.preventDefault()
        const delta = key === '0' ? 0 : key === '-' || key === '_' ? -1 : 1
        if (zoomTarget === 'directory') {
          setDirectoryFontPx((value) => key === '0' ? 13 : fontZoom(value, delta))
        } else {
          updateConfig((draft) => ({
            ...draft,
            rendering: {
              ...draft.rendering,
              [zoomTarget === 'widget' ? 'widgetFontPx' : 'readerFontPx']: key === '0'
                ? 16
                : fontZoom(draft.rendering[zoomTarget === 'widget' ? 'widgetFontPx' : 'readerFontPx'], delta)
            }
          }))
        }
        return
      }
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      if (key === config.shortcuts.toggleLeft) {
        event.preventDefault()
        updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarCollapsed: !draft.layout.leftSidebarCollapsed } }))
      } else if (key === config.shortcuts.toggleRight) {
        event.preventDefault()
        updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarCollapsed: !draft.layout.rightSidebarCollapsed } }))
      } else if (key === config.shortcuts.openContext) {
        event.preventDefault()
        setModal('settings')
      } else if (key === 'escape') {
        setAskMenu(null)
        setFloatingMenu(null)
        setModal(null)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [config, zoomTarget])

  async function openDocument(documentId: string) {
    if (!repo || !config) return
    const document =
      documentMap.get(documentId) ??
      documents.find((candidate) => candidate.path === documentId || candidate.id === documentId)
    if (!document) return

    setRepo((previous) =>
      previous ? { ...previous, currentDocumentId: document.id, updatedAt: new Date().toISOString() } : previous
    )

    updateConfig((draft) => ({
      ...draft,
      layout: { ...draft.layout, rightSidebarCollapsed: false },
      repository: { ...draft.repository, lastOpenedDocumentPath: document.path }
    }))

    if (document.isContentLoaded) return

    if (binding?.activeSourceMode === 'mounted-vault' && binding.mountedVaultPath) {
      try {
        const markdown = (await readMountedVaultTextFile(binding.mountedVaultPath, document.path)) ?? ''
        const loaded: DocumentNode = {
          ...document,
          contentMd: markdown,
          isContentLoaded: true,
          contentVersion: hashString(markdown),
          contentPlainText: markdownToPlainText(markdown),
          updatedAt: new Date().toISOString()
        }
        setDocuments((previous) => previous.map((item) => item.id === loaded.id ? loaded : item))
      } catch (loadError) {
        console.error(loadError)
      }
      return
    }

    if (binding?.activeSourceMode === 'remote-library' && binding.libraryId) {
      try {
        const loaded = await fetchRemoteDocument(document.id, binding.libraryId)
        setDocuments((previous) => previous.map((item) => item.id === document.id ? loaded : item))
      } catch (loadError) {
        console.error(loadError)
      }
    }
  }

  function openAsk(action: AskAction) {
    if (!config) return
    const session = buildPendingAskSession({
      ...action,
      learningPrompt: action.learningPrompt ?? config.learning.prompt
    })
    setAskMenu({ session, hoveredTemplateId: templates[0]?.id ?? null })
  }

  function openWidget(factory: (draft: CanvasState) => WidgetState) {
    if (!canvas) return
    updateCanvas((draft) => {
      const widget = factory(draft)
      return {
        ...draft,
        widgetStates: [...draft.widgetStates, widget],
        selection: { widgetId: widget.id }
      }
    }, true)
  }

  function createQaRecordWidget(draft: CanvasState, recordId: string): WidgetState {
    const frame = nextWidgetFrame(draft, { width: window.innerWidth, height: window.innerHeight })
    const viewport = normalizeCanvasViewport(draft.viewport)
    const leftPanelWidth = config!.layout.leftSidebarCollapsed ? RAIL_WIDTH : directoryFrame.w
    const readerPanelWidth = config!.layout.rightSidebarCollapsed
      ? RAIL_WIDTH
      : readerMaximized
        ? window.innerWidth - leftPanelWidth
        : readerFrame.w
    const offset = draft.widgetStates.length % 8
    const screenX = leftPanelWidth + readerPanelWidth + 18 + offset * 18
    const screenY = 16 + offset * 16

    return {
      ...frame,
      position: {
        x: Math.round((screenX - viewport.x) / viewport.zoom),
        y: Math.round((screenY - viewport.y) / viewport.zoom)
      },
      type: 'qa-record',
      props: { qaRecordId: recordId }
    }
  }

  function openRecordWidget(recordId: string) {
    if (!canvas || !config || !activeRecords.some((record) => record.id === recordId)) return
    setAskMenu(null)
    updateCanvas((draft) => {
      const zIndex = Math.max(0, ...draft.widgetStates.map((widget) => widget.zIndex)) + 1
      const existing = draft.widgetStates.find((widget) => widget.type === 'qa-record' && widget.props.qaRecordId === recordId)
      if (existing) {
        return {
          ...draft,
          widgetStates: draft.widgetStates.map((widget) =>
            widget.id === existing.id ? { ...widget, zIndex, isCollapsed: false } : widget
          ),
          selection: { widgetId: existing.id }
        }
      }
      const widget = createQaRecordWidget(draft, recordId)
      return { ...draft, widgetStates: [...draft.widgetStates, widget], selection: { widgetId: widget.id } }
    }, true)
  }

  async function runRecord(seed: QARecord) {
    if (!config) return
    const controller = new AbortController()
    activeRuns.current.set(seed.id, controller)
    let text = ''
    let firstTokenAt: string | undefined
    let modelInfo: QARecord['modelInfo'] = buildModelInfo(config)
    const startedAt = Date.now()
    try {
      for await (const chunk of streamAnswer({
        config,
        qaRecord: seed,
        signal: controller.signal,
        onModelInfo: (next) => {
          modelInfo = next
        }
      })) {
        if (!firstTokenAt) firstTokenAt = new Date().toISOString()
        text += chunk
        const next: QARecord = {
          ...seed,
          answerMarkdown: text,
          answerStatus: 'streaming',
          modelInfo,
          timing: { ...seed.timing, firstTokenAt },
          updatedAt: new Date().toISOString()
        }
        setRecords((previous) => upsertQaRecord(previous, next))
      }
      const done: QARecord = {
        ...seed,
        answerMarkdown: text,
        answerStatus: 'done',
        modelInfo,
        timing: { ...seed.timing, firstTokenAt, completedAt: new Date().toISOString(), durationMs: Date.now() - startedAt },
        updatedAt: new Date().toISOString()
      }
      setRecords((previous) => upsertQaRecord(previous, done))
      await saveQaRecord(done)
    } catch (runError) {
      if (isAbortError(runError)) return
      const failed: QARecord = {
        ...seed,
        answerMarkdown: runError instanceof Error ? runError.message : 'Answer failed',
        answerStatus: 'error',
        modelInfo,
        updatedAt: new Date().toISOString()
      }
      setRecords((previous) => upsertQaRecord(previous, failed))
      await saveQaRecord(failed)
    } finally {
      activeRuns.current.delete(seed.id)
    }
  }

  async function askTemplate(template: PromptTemplate) {
    if (!askMenu || !config || !repo || !canvas) return
    const record = createPendingRecord({
      action: askMenu.session.action,
      config,
      repo,
      documents,
      canvasId: canvas.id || MAIN_CANVAS_ID,
      template,
      sourceParentRecord: askMenu.session.action.sourceQaRecordId
        ? activeRecords.find((record) => record.id === askMenu.session.action.sourceQaRecordId) ?? null
        : null
    })
    setAskMenu(null)
    setRecords((previous) => upsertQaRecord(previous, record))
    await saveQaRecord(record)
    openWidget((draft) => createQaRecordWidget(draft, record.id))
    void runRecord(record)
  }

  async function removeRecord(record: QARecord | null, widgetId: string) {
    if (record) {
      activeRuns.current.get(record.id)?.abort()
      const deleted = { ...record, lifecycle: { ...record.lifecycle, isDeleted: true, deletedAt: new Date().toISOString() }, updatedAt: new Date().toISOString() }
      setRecords((previous) => upsertQaRecord(previous, deleted))
      await deleteQaRecord(deleted)
    }
    updateCanvas((draft) => ({
      ...draft,
      widgetStates: draft.widgetStates.filter((widget) => widget.id !== widgetId),
      selection: { widgetId: draft.selection?.widgetId === widgetId ? null : draft.selection?.widgetId ?? null }
    }))
  }

  if (loading) return <div className="boot">{t('app.loading')}</div>
  if (error || !repo || !config || !canvas || !currentDocument) return <div className="boot">{error ?? t('app.missingWorkspace')}</div>

  const leftWidth = config.layout.leftSidebarCollapsed ? RAIL_WIDTH : directoryFrame.w
  const readerLeft = leftWidth
  const readerWidth = config.layout.rightSidebarCollapsed ? RAIL_WIDTH : readerMaximized ? window.innerWidth - readerLeft : readerFrame.w
  const readerTitle = currentDocument.path.split('/').slice(0, -1).join('/')
  const tier = llmAccess?.subscription?.effectiveTier ?? 'free'
  const dailyQuota = llmAccess?.dailyQuota ?? 0
  const dailyUsed = llmAccess?.dailyUsed ?? Math.max(0, dailyQuota - (llmAccess?.dailyRemaining ?? dailyQuota))
  const permanentBalance = llmAccess?.permanentBalance ?? llmAccess?.creditBalance ?? 0
  const creditSummary = `${tier === 'free' ? t('common.free') : tier.toUpperCase()} ${dailyUsed}/${dailyQuota} (+${permanentBalance})`
  const viewport = normalizeCanvasViewport(canvas.viewport)
  const visibleWidgets = canvas.widgetStates.filter((widget) => {
    if (widget.type === 'ask') return true
    return activeRecords.some((record) => record.id === widget.props.qaRecordId)
  })

  return (
    <main
      className="app-canvas"
      onPointerDown={(event) => {
        if ((event.target as HTMLElement).closest('.window-frame,button,input,textarea')) return
        const start = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y }
        const move = (moveEvent: PointerEvent) => updateCanvas((draft) => ({
          ...draft,
          viewport: { ...draft.viewport, x: start.vx + moveEvent.clientX - start.x, y: start.vy + moveEvent.clientY - start.y }
        }))
        const done = () => {
          window.removeEventListener('pointermove', move)
          window.removeEventListener('pointerup', done)
          window.removeEventListener('pointercancel', done)
        }
        window.addEventListener('pointermove', move)
        window.addEventListener('pointerup', done)
        window.addEventListener('pointercancel', done)
      }}
    >
      <div className="canvas-grid" style={{ backgroundPosition: `${viewport.x}px ${viewport.y}px` }} />
      <div
        className="canvas-scene"
        style={{ zIndex: 1, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
      >
        {visibleWidgets.map((widget) => {
          const record = widget.type === 'qa-record' ? activeRecords.find((item) => item.id === widget.props.qaRecordId) ?? null : null
          return (
            <QaWidget
              key={widget.id}
              widget={widget}
              record={record}
              highlights={record ? widgetHighlights.get(record.id) ?? EMPTY_HIGHLIGHTS : EMPTY_HIGHLIGHTS}
              documents={documents}
              config={config}
              onFocus={() => {
                setZoomTarget('widget')
                updateCanvas((draft) => {
                  const z = Math.max(0, ...draft.widgetStates.map((item) => item.zIndex)) + 1
                  return { ...draft, widgetStates: draft.widgetStates.map((item) => item.id === widget.id ? { ...item, zIndex: z } : item), selection: { widgetId: widget.id } }
                })
              }}
              onFrameChange={(frame) => updateCanvas((draft) => ({
                ...draft,
                widgetStates: draft.widgetStates.map((item) =>
                  item.id === widget.id
                    ? { ...item, position: { x: frame.x, y: frame.y }, size: { w: frame.w, h: frame.h } }
                    : item
                )
              }))}
              onToggle={() => updateCanvas((draft) => ({ ...draft, widgetStates: draft.widgetStates.map((item) => item.id === widget.id ? { ...item, isCollapsed: !item.isCollapsed } : item) }))}
              onClose={() => updateCanvas((draft) => ({ ...draft, widgetStates: draft.widgetStates.filter((item) => item.id !== widget.id) }))}
              onDelete={() => void removeRecord(record, widget.id)}
              onAsk={openAsk}
              onOpenRecord={openRecordWidget}
            />
          )
        })}
      </div>

      <WindowFrame
        className="directory-window"
        collapsed={config.layout.leftSidebarCollapsed}
        title={<Logo />}
        style={{ left: 0, top: directoryFrame.y, width: leftWidth, height: '100vh', zIndex: 20 }}
        onMouseDown={() => setZoomTarget('directory')}
        resizeHandles={['e']}
        resizeWhenCollapsed
        onCollapsedBlankClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarCollapsed: false } }))}
        onResize={(handle, dx, dy) => {
          const frame = resizeFrame(handle, { x: 0, y: directoryFrame.y, w: leftWidth, h: directoryFrame.h }, dx, dy, RAIL_WIDTH, 160)
          const collapsed = frame.w < DIRECTORY_AUTO_COLLAPSE_WIDTH
          const width = collapsed ? DIRECTORY_AUTO_COLLAPSE_WIDTH : frame.w
          setDirectoryFrame({ ...frame, x: 0, w: width })
          updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarWidth: width, leftSidebarCollapsed: collapsed } }))
        }}
        actions={<IconButton icon={config.layout.leftSidebarCollapsed ? 'chevronRight' : 'chevronLeft'} label={t('window.directory')} onClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarCollapsed: !draft.layout.leftSidebarCollapsed } }))} />}
        footerClassName="directory-footer"
        footer={
          <>
            <button
              type="button"
              aria-label={creditSummary}
              title={creditSummary}
              onMouseDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setFloatingMenu((current) => current?.kind === 'model' ? null : { kind: 'model', x: rect.left, y: rect.top })
              }}
            >
              <Icon name="star" />
              <span>{creditSummary}</span>
            </button>
            <IconButton icon="settings" label={t('common.settings')} onClick={() => setModal('settings')} />
          </>
        }
      >
        <div className="directory-body" style={{ fontSize: directoryFontPx }}>
          <Sidebar
            repo={repo}
            nodes={nodes}
            documents={documents}
            currentDocumentId={currentDocument.id}
            collapsedIds={config.navigation.collapsedSidebarFolderIds}
            onToggle={(nodeId) => updateConfig((draft) => {
              const exists = draft.navigation.collapsedSidebarFolderIds.includes(nodeId)
              return { ...draft, navigation: { ...draft.navigation, collapsedSidebarFolderIds: exists ? draft.navigation.collapsedSidebarFolderIds.filter((id) => id !== nodeId) : [...draft.navigation.collapsedSidebarFolderIds, nodeId] } }
            })}
            onOpen={openDocument}
            onAsk={openAsk}
          />
        </div>
      </WindowFrame>

      <WindowFrame
        className="reader-window"
        collapsed={config.layout.rightSidebarCollapsed}
        title={<span>{readerTitle}</span>}
        style={{ left: readerLeft, top: readerFrame.y, width: readerWidth, height: '100vh', zIndex: 18 }}
        onMouseDown={() => setZoomTarget('reader')}
        resizeHandles={['e']}
        resizeWhenCollapsed
        onCollapsedBlankClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarCollapsed: false } }))}
        onResize={(handle, dx, dy) => {
          const frame = resizeFrame(handle, { x: readerLeft, y: readerFrame.y, w: Number(readerWidth), h: readerFrame.h }, dx, dy, RAIL_WIDTH, 160)
          const collapsed = frame.w < READER_AUTO_COLLAPSE_WIDTH
          const width = collapsed ? READER_AUTO_COLLAPSE_WIDTH : frame.w
          setReaderMaximized(false)
          setReaderFrame({ ...frame, x: readerLeft, w: width })
          updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarWidth: width, rightSidebarCollapsed: collapsed } }))
        }}
        actions={
          <>
            {!config.layout.rightSidebarCollapsed ? (
              <IconButton icon="maximize" label={t('window.maximize')} active={readerMaximized} onClick={() => setReaderMaximized((value) => !value)} />
            ) : null}
            <IconButton icon={config.layout.rightSidebarCollapsed ? 'chevronRight' : 'chevronLeft'} label={t('window.reader')} onClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarCollapsed: !draft.layout.rightSidebarCollapsed } }))} />
          </>
        }
      >
        <article
          key={currentDocument.id}
          className="reader-body markdown-body"
          style={{ fontSize: config.rendering.readerFontPx }}
          onClick={(event) => {
            const recordId = markedRecordIdFromTarget(event.target)
            if (!recordId) return
            event.preventDefault()
            event.stopPropagation()
            openRecordWidget(recordId)
          }}
          onMouseUp={(event) => {
            const action = selectionAction({
              eventPoint: { x: event.clientX, y: event.clientY + 8 },
              surface: 'reader',
              target: { documentId: currentDocument.id },
              surfaceTitle: titleForDocument(currentDocument),
              surfaceText: plainContextForDocument(currentDocument)
            })
            if (action) openAsk(action)
          }}
        >
          {markdownBlocks(currentDocument.contentMd, currentDocument.path, readerHighlights)}
        </article>
      </WindowFrame>

      {askMenu ? (
        <AskMenu
          state={askMenu}
          templates={templates}
          onHover={(templateId) => setAskMenu((current) => current ? { ...current, hoveredTemplateId: templateId } : current)}
          onPick={(template) => void askTemplate(template)}
          onClose={() => setAskMenu(null)}
        />
      ) : null}

      {floatingMenu ? (
        <FloatingMenu
          state={floatingMenu}
          config={config}
          llmAccess={llmAccess}
          onClose={() => setFloatingMenu(null)}
          onOpenSettings={() => setModal('settings')}
          onSelectModel={(modelId) => updateConfig((draft) => ({ ...draft, provider: { ...draft.provider, model: modelId } }))}
        />
      ) : null}

      {modal === 'settings' ? (
        <>
          <div className="modal-backdrop" />
          <SettingsWindow
            config={config}
            binding={binding}
            frame={settingsFrame}
            onClose={() => setModal(null)}
            onChange={updateConfig}
            onResize={(handle, dx, dy) => setSettingsFrame((frame) => resizeFrame(handle, frame, dx, dy, 360, 260))}
          />
        </>
      ) : null}
    </main>
  )
}
