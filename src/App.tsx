import { Suspense, lazy, useEffect, useMemo, useRef, useState, type CSSProperties, type WheelEvent as ReactWheelEvent } from 'react'
import { deleteQaRecord, bootstrapWorkspace, saveQaRecord, saveWorkspaceState } from './lib/bootstrap'
import { ApiRequestError, createLibraryErrataTicket, fetchRemoteDocument } from './lib/api'
import { applyPromptTemplateDefaults, MAIN_CANVAS_ID } from './lib/defaults'
import { buildModelInfo, streamAnswer } from './lib/provider'
import {
  areStringArraysEqual,
  normalizeCollapsedSidebarFolderIds,
  toggleCollapsedSidebarFolderId
} from './lib/sidebar-tree-state'
import { clamp, createId } from './lib/text'
import { resolveWorkspacePersistRetryDelayMs, shouldAutoRetryWorkspacePersist } from './lib/workspace-persist-errors'
import {
  createWorkspacePersistUiState,
  markWorkspacePersistConflictReloaded,
  markWorkspacePersistDirty,
  markWorkspacePersistFailed,
  markWorkspacePersistStarted,
  markWorkspacePersistSucceeded,
  resolveWorkspacePersistBanner
} from './lib/workspace-persist-ui'
import {
  allowedContextModesForNextAsk,
  allowedContextModesForSurface,
  buildContextSnapshot,
  buildContextPreview,
  buildPendingAskSession,
  createPendingRecord,
  ensureWidgetVisible,
  estimateCanvasViewportSize,
  frameWidgetInCanvasViewport,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_RIGHT_SIDEBAR_WIDTH,
  normalizeCanvasViewport,
  resolveContextMode,
  nextWidgetFrame,
  sortTemplates,
  upsertQaRecord,
  WORKSPACE_SPLITTER_WIDTH
} from './lib/app-helpers'
import type {
  AppConfig,
  AskSelection,
  CanvasState,
  CanvasViewportSize,
  DocumentNode,
  LlmAccessState,
  PromptTemplate,
  QARecord,
  ReadingContextMode,
  RepoMeta,
  RepositoryBinding,
  SidebarNode,
  WidgetState
} from './types/domain'
import { SidebarTree } from './components/SidebarTree'
import {
  AskMenu,
  type AskMenuState,
  CollapsedRail,
  ContextSettingsModal,
  GlobalSettingsModal,
  GroupChooser,
  TemplateSettingsModal
} from './components/Chrome'
import { QuickErrataModal, type QuickErrataFormFields } from './components/QuickErrataModal'
import { useI18n } from './i18n/useI18n'
import { useAuthSession } from './lib/auth-session'
import { buildLibrariesPath, buildLoginPath, buildSubscriptionPath } from './lib/web-routing'

type ModalName = 'templates' | 'settings' | null
type FontPaneTarget = 'reader' | 'widget'
type MobilePortraitPane = 'left' | 'reader' | 'right'

type ContextModalTarget =
  | {
      kind: 'next-ask'
    }
  | {
      kind: 'ask-menu'
    }
  | {
      kind: 'ask-widget'
      widgetId: string
    }
  | null

interface GroupChooserState {
  point: { x: number; y: number }
  recordIds: string[]
}

const MarkdownSurface = lazy(() =>
  import('./components/MarkdownSurface').then((module) => ({ default: module.MarkdownSurface }))
)
const CanvasPane = lazy(() =>
  import('./components/CanvasPane').then((module) => ({ default: module.CanvasPane }))
)

const MIN_READER_PANE_WIDTH = 280
const MIN_CONTENT_FONT_PX = 12
const MAX_CONTENT_FONT_PX = 28
const DEFAULT_CONTENT_FONT_PX = 16
const SIDEBAR_COLLAPSE_DRAG_THRESHOLD = 56
const MOBILE_PORTRAIT_LAYOUT_QUERY = '(max-width: 960px) and (orientation: portrait)'
const READER_SCROLL_SAVE_DEBOUNCE_MS = 180
const READER_SCROLL_REMOTE_PERSIST_DEBOUNCE_MS = 15_000

function markdownStartsWithHeading(markdown: string) {
  const firstNonEmptyLine = markdown
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .find((line) => line.trim().length > 0)

  return Boolean(firstNonEmptyLine && /^#(?:\s|$)/.test(firstNonEmptyLine.trimStart()))
}

function sameWidgetGeometry(left: WidgetState, right: WidgetState) {
  return (
    left.position.x === right.position.x &&
    left.position.y === right.position.y &&
    left.size.w === right.size.w &&
    left.size.h === right.size.h &&
    left.zIndex === right.zIndex &&
    left.isCollapsed === right.isCollapsed
  )
}

function sameCanvasViewport(left: CanvasState['viewport'], right: CanvasState['viewport']) {
  return left.x === right.x && left.y === right.y && left.zoom === right.zoom
}

function normalizeCanvasState(canvas: CanvasState): CanvasState {
  const viewport = normalizeCanvasViewport(canvas.viewport)
  return sameCanvasViewport(canvas.viewport, viewport)
    ? canvas
    : {
        ...canvas,
        viewport
      }
}

function describeWorkspaceError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return t('app.workspaceError.sessionInvalid')
    }

    if (error.status === 409) {
      if (/^Library\s+.+\s+has no readable revision$/.test(error.message)) {
        return t('app.workspaceError.noReadableRevision')
      }

      if (/^Revision\s+.+\s+has no readable documents$/.test(error.message)) {
        return t('app.workspaceError.noReadableDocuments')
      }
    }

    if (error.status === 404) {
      return error.message === 'No readable libraries are available for this account'
        ? t('app.workspaceError.noReadableLibraries')
        : /^Library\s+.+\s+was not found or is not accessible$/.test(error.message)
          ? t('app.workspaceError.libraryNotAccessible')
          : error.message
    }

    return error.message
  }

  return error instanceof Error ? error.message : t('app.workspaceError.failedToLoad')
}

function describeWorkspacePersistError(error: unknown, t: ReturnType<typeof useI18n>['t']) {
  if (error instanceof ApiRequestError) {
    if (error.status === 401) {
      return t('app.workspaceError.sessionInvalid')
    }

    if (error.status === 403) {
      return t('app.workspacePersist.failedForbidden')
    }

    if (error.status === 404) {
      return t('app.workspacePersist.failedNotFound')
    }

    return error.message
  }

  return error instanceof Error ? error.message : t('app.workspacePersist.failedUnknown')
}
function isAbortError(error: unknown) {
  return (
    (typeof DOMException !== 'undefined' && error instanceof DOMException && error.name === 'AbortError') ||
    (error instanceof Error && error.name === 'AbortError')
  )
}

function useMobilePortraitLayout() {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(MOBILE_PORTRAIT_LAYOUT_QUERY).matches : false
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    const mediaQuery = window.matchMedia(MOBILE_PORTRAIT_LAYOUT_QUERY)
    const updateMatches = () => setMatches(mediaQuery.matches)

    updateMatches()
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', updateMatches)
      return () => mediaQuery.removeEventListener('change', updateMatches)
    }

    mediaQuery.addListener(updateMatches)
    return () => mediaQuery.removeListener(updateMatches)
  }, [])

  return matches
}

type QuickErrataDraftState = QuickErrataFormFields & {
  idempotencyKey: string
}

interface QuickErrataTargetState {
  documentId: string
  documentTitle: string
  documentPath: string
}

function createQuickErrataDraft(overrides?: Partial<QuickErrataDraftState>): QuickErrataDraftState {
  return {
    idempotencyKey: createId('errata-ticket'),
    severity: 'medium',
    title: '',
    description: '',
    proposedFix: '',
    selectionQuote: '',
    selectionContext: '',
    ...overrides
  }
}

function formatLlmModelDisplayName(displayName: string | undefined, model: string) {
  const trimmedDisplayName = displayName?.trim() ?? ''
  if (!trimmedDisplayName) {
    return model.trim()
  }
  return trimmedDisplayName
}

function FourPointStarIcon() {
  return (
    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
      <path
        d="M12 2.5 14.5 9.5 21.5 12 14.5 14.5 12 21.5 9.5 14.5 2.5 12 9.5 9.5 12 2.5Z"
        fill="currentColor"
      />
    </svg>
  )
}

export function App() {
  const auth = useAuthSession()
  const { t } = useI18n()
  const isMobilePortraitLayout = useMobilePortraitLayout()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataRoot, setDataRoot] = useState('')
  const [repo, setRepo] = useState<RepoMeta | null>(null)
  const [documents, setDocuments] = useState<DocumentNode[]>([])
  const [sidebarNodes, setSidebarNodes] = useState<SidebarNode[]>([])
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [canvas, setCanvas] = useState<CanvasState | null>(null)
  const [qaRecords, setQaRecords] = useState<QARecord[]>([])
  const [llmAccess, setLlmAccess] = useState<LlmAccessState | null>(null)
  const [repositoryBinding, setRepositoryBinding] = useState<RepositoryBinding | null>(null)
  const [askMenu, setAskMenu] = useState<AskMenuState | null>(null)
  const [nextAskContextMode, setNextAskContextMode] = useState<ReadingContextMode | null>(null)
  const [contextModalTarget, setContextModalTarget] = useState<ContextModalTarget>(null)
  const [modal, setModal] = useState<ModalName>(null)
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false)
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const [isReaderFullscreen, setIsReaderFullscreen] = useState(false)
  const [groupChooser, setGroupChooser] = useState<GroupChooserState | null>(null)
  const [mobilePortraitPane, setMobilePortraitPane] = useState<MobilePortraitPane>('reader')
  const [quickErrataOpen, setQuickErrataOpen] = useState(false)
  const [quickErrataDraft, setQuickErrataDraft] = useState<QuickErrataDraftState>(() => createQuickErrataDraft())
  const [quickErrataTarget, setQuickErrataTarget] = useState<QuickErrataTargetState | null>(null)
  const [quickErrataSubmitting, setQuickErrataSubmitting] = useState(false)
  const [quickErrataSubmitted, setQuickErrataSubmitted] = useState(false)
  const [quickErrataError, setQuickErrataError] = useState<string | null>(null)
  const [workspacePersistUiState, setWorkspacePersistUiState] = useState(createWorkspacePersistUiState)
  const configRef = useRef<AppConfig | null>(null)
  const canvasRef = useRef<CanvasState | null>(null)
  const qaRecordsRef = useRef<QARecord[]>([])
  const workspaceVersionRef = useRef(0)
  const lastPersistedConfigRef = useRef<AppConfig | null>(null)
  const lastPersistedCanvasRef = useRef<CanvasState | null>(null)
  const workspacePersistEpochRef = useRef(0)
  const workspacePersistRef = useRef<{
    timer: number | null
    inFlight: boolean
    pendingAfterFlight: boolean
  }>({
    timer: null,
    inFlight: false,
    pendingAfterFlight: false
  })
  const activeRecordRunsRef = useRef(new Map<string, AbortController>())
  const workspaceRef = useRef<HTMLDivElement | null>(null)
  const settingsMenuRef = useRef<HTMLDivElement | null>(null)
  const modelMenuRef = useRef<HTMLDivElement | null>(null)
  const readerScrollRef = useRef<HTMLDivElement | null>(null)
  const readerScrollPersistTimerRef = useRef<number | null>(null)
  const readerScrollWorkspacePersistTimerRef = useRef<number | null>(null)
  const skipNextConfigAutoPersistRef = useRef(false)
  const lastFontPaneRef = useRef<FontPaneTarget>('reader')
  const remoteDocumentLoadsRef = useRef(new Set<string>())
  const rightPaneVisibilitySyncRef = useRef<string | null>(null)
  const [workspaceWidth, setWorkspaceWidth] = useState(0)
  const [canvasViewportSize, setCanvasViewportSize] = useState<CanvasViewportSize>({
    width: 0,
    height: 0
  })
  const resolvedCanvasViewportSize = useMemo(
    () => (config ? estimateCanvasViewportSize(config.layout, canvasViewportSize) : canvasViewportSize),
    [canvasViewportSize, config]
  )
  const workspacePersistBanner = useMemo(
    () =>
      resolveWorkspacePersistBanner(workspacePersistUiState, {
        failedTitle: t('app.workspacePersist.failedTitle'),
        failedBody: t('app.workspacePersist.failedBody'),
        failedDetail: workspacePersistUiState.failureMessage
          ? t('app.workspacePersist.failedDetail', {
              error: workspacePersistUiState.failureMessage
            })
          : null,
        conflictTitle: t('app.workspacePersist.conflictTitle'),
        conflictBody: t('app.workspacePersist.conflictBody')
      }),
    [t, workspacePersistUiState]
  )
  const isLeftPaneCollapsed = config?.layout.leftSidebarCollapsed ?? false
  const isRightPaneCollapsed = config?.layout.rightSidebarCollapsed ?? true
  const isCanvasPaneVisible = isMobilePortraitLayout ? mobilePortraitPane === 'right' : true
  const activeCanvasWidgetId = canvas?.selection?.widgetId ?? canvas?.widgetStates.at(-1)?.id ?? null
  const isCanvasViewportMeasured = canvasViewportSize.width > 0 && canvasViewportSize.height > 0

  useEffect(() => {
    void loadWorkspace({ reason: 'initial' })
  }, [])

  useEffect(() => {
    configRef.current = config
  }, [config])

  useEffect(() => {
    canvasRef.current = canvas
  }, [canvas])

  useEffect(() => {
    qaRecordsRef.current = qaRecords
  }, [qaRecords])

  useEffect(
    () => () => {
      const pendingTimer = readerScrollPersistTimerRef.current
      if (pendingTimer !== null) {
        window.clearTimeout(pendingTimer)
        readerScrollPersistTimerRef.current = null
      }

      const pendingWorkspacePersistTimer = readerScrollWorkspacePersistTimerRef.current
      if (pendingWorkspacePersistTimer !== null) {
        window.clearTimeout(pendingWorkspacePersistTimer)
        readerScrollWorkspacePersistTimerRef.current = null
      }
    },
    []
  )

  useEffect(() => {
    if (!config || !canvasRef.current || config === lastPersistedConfigRef.current) {
      return
    }

    if (skipNextConfigAutoPersistRef.current) {
      skipNextConfigAutoPersistRef.current = false
      return
    }

    setWorkspacePersistUiState((current) => markWorkspacePersistDirty(current))
    scheduleWorkspacePersist()
  }, [config])

  useEffect(() => {
    if (!canvas || !configRef.current || canvas === lastPersistedCanvasRef.current) {
      return
    }

    setWorkspacePersistUiState((current) => markWorkspacePersistDirty(current))
    scheduleWorkspacePersist()
  }, [canvas])

  useEffect(() => {
    const workspace = workspaceRef.current
    if (!workspace) {
      return
    }

    const measure = () => {
      setWorkspaceWidth(workspace.getBoundingClientRect().width)
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(workspace)
    window.addEventListener('resize', measure)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', measure)
    }
  }, [Boolean(config)])

  useEffect(() => {
    if (!config) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      const tagName = target?.tagName ?? ''
      const isEditable = tagName === 'INPUT' || tagName === 'TEXTAREA' || Boolean(target?.isContentEditable)
      if (isEditable) {
        return
      }

      const hasContentFontModifier = event.ctrlKey || event.metaKey
      if (hasContentFontModifier) {
        if (event.key === '=' || event.key === '+' || event.code === 'NumpadAdd') {
          event.preventDefault()
          adjustActivePaneFont(1)
          return
        }

        if (event.key === '-' || event.code === 'NumpadSubtract') {
          event.preventDefault()
          adjustActivePaneFont(-1)
          return
        }

        if (event.key === '0' || event.code === 'Digit0' || event.code === 'Numpad0') {
          event.preventDefault()
          resetActivePaneFont()
          return
        }
      }

      if (event.key.toLowerCase() === config.shortcuts.toggleLeft) {
        event.preventDefault()
        setLeftSidebarCollapsed(!isLeftPaneCollapsed)
      } else if (event.key.toLowerCase() === config.shortcuts.toggleRight) {
        event.preventDefault()
        setRightSidebarCollapsed(!isRightPaneCollapsed)
      } else if (event.key.toLowerCase() === config.shortcuts.openContext) {
        event.preventDefault()
        openContextSettings()
      } else if (event.key === 'Escape') {
        setAskMenu(null)
        setGroupChooser(null)
        setContextModalTarget(null)
        setModal(null)
        setSettingsMenuOpen(false)
        setModelMenuOpen(false)
        setQuickErrataOpen(false)
        setQuickErrataTarget(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [config, isLeftPaneCollapsed, isRightPaneCollapsed, askMenu, canvas, nextAskContextMode])

  useEffect(() => {
    if (!settingsMenuOpen && !modelMenuOpen) {
      return
    }

    const closeFloatingMenus = (event: PointerEvent) => {
      const target = event.target as Node
      if (settingsMenuRef.current?.contains(target) || modelMenuRef.current?.contains(target)) {
        return
      }
      setSettingsMenuOpen(false)
      setModelMenuOpen(false)
    }

    window.addEventListener('pointerdown', closeFloatingMenus)
    return () => window.removeEventListener('pointerdown', closeFloatingMenus)
  }, [modelMenuOpen, settingsMenuOpen])

  useEffect(() => {
    if (!canvas?.id) {
      rightPaneVisibilitySyncRef.current = null
      return
    }

    if (!isCanvasPaneVisible || !activeCanvasWidgetId) {
      rightPaneVisibilitySyncRef.current = null
      return
    }

    const visibilityScope = isMobilePortraitLayout ? 'mobile-portrait' : 'desktop'
    const viewportScope = isCanvasViewportMeasured ? 'measured' : 'fallback'
    const syncKey = `${canvas.id}:${activeCanvasWidgetId}:${visibilityScope}:${viewportScope}`

    if (rightPaneVisibilitySyncRef.current === syncKey) {
      return
    }

    rightPaneVisibilitySyncRef.current = syncKey
    ensureWidgetVisibleInCanvas(activeCanvasWidgetId)
  }, [activeCanvasWidgetId, canvas?.id, isCanvasPaneVisible, isCanvasViewportMeasured, isMobilePortraitLayout])

  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const currentDocument = repo ? documentMap.get(repo.currentDocumentId) ?? documents[0] : null
  const normalizedCollapsedSidebarFolderIds = useMemo(
    () => (config ? normalizeCollapsedSidebarFolderIds(config.navigation.collapsedSidebarFolderIds, sidebarNodes) : []),
    [config, sidebarNodes]
  )
  const activeRecords = useMemo(() => qaRecords.filter((record) => !record.lifecycle.isDeleted), [qaRecords])
  const sortedTemplates = useMemo(
    () => sortTemplates(config?.templates ?? []).filter((template) => template.isEnabled),
    [config]
  )
  const selectedLlmModel = useMemo(() => {
    if (!config || !llmAccess?.models.length) {
      return null
    }

    return (
      llmAccess.models.find((model) => model.id === config.provider.model) ??
      llmAccess.models.find((model) => model.isDefault) ??
      llmAccess.models[0] ??
      null
    )
  }, [config, llmAccess])

  useEffect(() => {
    if (!config) {
      return
    }

    if (areStringArraysEqual(config.navigation.collapsedSidebarFolderIds, normalizedCollapsedSidebarFolderIds)) {
      return
    }

    updateConfig((draft) => ({
      ...draft,
      navigation: {
        ...draft.navigation,
        collapsedSidebarFolderIds: normalizeCollapsedSidebarFolderIds(
          draft.navigation.collapsedSidebarFolderIds,
          sidebarNodes
        )
      }
    }))
  }, [config, normalizedCollapsedSidebarFolderIds, sidebarNodes])

  useEffect(() => {
    if (!config || !llmAccess?.models.length) {
      return
    }

    if (llmAccess.models.some((model) => model.id === config.provider.model)) {
      return
    }

    const fallbackModelId = llmAccess.models.find((model) => model.isDefault)?.id ?? llmAccess.models[0]?.id
    if (!fallbackModelId || fallbackModelId === config.provider.model) {
      return
    }

    updateConfig((draft) => ({
      ...draft,
      provider: {
        ...draft.provider,
        model: fallbackModelId
      }
    }))
  }, [config, llmAccess])

  const focusedEditableAskWidget = useMemo(() => {
    if (!canvas?.selection?.widgetId) {
      return null
    }

    const widget = canvas.widgetStates.find((candidate) => candidate.id === canvas.selection?.widgetId)
    if (
      !widget ||
      widget.type !== 'ask' ||
      widget.props.mode !== 'custom' ||
      widget.props.requestState !== 'editing' ||
      !widget.props.pendingSession
    ) {
      return null
    }

    return widget
  }, [canvas])
  const contextModalState = useMemo(() => {
    if (!contextModalTarget || !config || !repo) {
      return null
    }

    if (contextModalTarget.kind === 'next-ask') {
      return {
        title: t('app.context.nextAsk.title'),
        note: t('app.context.nextAsk.note'),
        currentMode: nextAskContextMode ?? config.context.defaultMode,
        allowedModes: allowedContextModesForNextAsk(),
        viewportRangeBlocks: config.context.viewportRangeBlocks,
        learningPrompt: config.learning.prompt,
        selectedText: undefined,
        previewText: undefined
      }
    }

    if (contextModalTarget.kind === 'ask-menu') {
      const action = askMenu?.session.action
      if (!action) {
        return null
      }
      const preview = buildContextPreview({
        action,
        config,
        repo,
        documents
      })
      return {
        title: t('app.context.currentAsk.title'),
        note: t('app.context.currentAsk.note'),
        currentMode: action.contextMode ?? resolveContextMode(action, config),
        allowedModes: allowedContextModesForSurface(action.surface),
        viewportRangeBlocks: config.context.viewportRangeBlocks,
        learningPrompt: action.learningPrompt ?? config.learning.prompt,
        selectedText: action.selection.text,
        previewText: preview.readingContext
      }
    }

    const widget = canvas?.widgetStates.find((candidate) => candidate.id === contextModalTarget.widgetId)
    if (!widget || widget.type !== 'ask' || !widget.props.pendingSession) {
      return null
    }

    const action = widget.props.pendingSession.action
    const preview = buildContextPreview({
      action,
      config,
      repo,
      documents
    })

    return {
      title: t('app.context.currentAsk.title'),
      note: t('app.context.currentWidgetAsk.note'),
      currentMode: action.contextMode ?? resolveContextMode(action, config),
      allowedModes: allowedContextModesForSurface(action.surface),
      viewportRangeBlocks: config.context.viewportRangeBlocks,
      learningPrompt: action.learningPrompt ?? config.learning.prompt,
      selectedText: action.selection.text,
      previewText: preview.readingContext
    }
  }, [askMenu, canvas, config, contextModalTarget, documents, nextAskContextMode, repo, t])
  const isRemoteRepo = repositoryBinding?.activeSourceMode === 'remote-library'
  const mountedVaultPath = repositoryBinding?.activeSourceMode === 'mounted-vault' ? repositoryBinding.mountedVaultPath : undefined
  const remoteLibraryId = isRemoteRepo ? repositoryBinding?.libraryId ?? repo?.libraryId : undefined
  const remoteRevisionId = isRemoteRepo ? repositoryBinding?.revisionId ?? repo?.revisionId : undefined
  const requestedReaderLibraryId =
    typeof window === 'undefined' ? undefined : new URLSearchParams(window.location.search).get('libraryId') ?? undefined
  const bootLibrariesPath = buildLibrariesPath(requestedReaderLibraryId)
  const librariesPath = buildLibrariesPath(remoteLibraryId)
  const subscriptionPath = buildSubscriptionPath()
  const topbarModelValue = selectedLlmModel?.id ?? config?.provider.model ?? ''
  const topbarCreditBalance = llmAccess?.creditBalance ?? 0
  const topbarDailyRemaining = llmAccess?.dailyRemaining
  const topbarDailyQuota = llmAccess?.dailyQuota
  const topbarCreditSummary =
    typeof topbarDailyRemaining === 'number' && typeof topbarDailyQuota === 'number'
      ? `${topbarDailyRemaining}/${topbarDailyQuota} + ${topbarCreditBalance}`
      : String(topbarCreditBalance)
  const layoutMetrics = useMemo(() => {
    if (!config) {
      return null
    }

    const leftSidebarWidth = clamp(
      config.layout.leftSidebarWidth,
      config.layout.leftSidebarMinWidth,
      MAX_LEFT_SIDEBAR_WIDTH
    )
    const rightSidebarWidth = clamp(
      config.layout.rightSidebarWidth,
      config.layout.rightSidebarMinWidth,
      MAX_RIGHT_SIDEBAR_WIDTH
    )
    const readerPanelWidth = clamp(
      Math.max(rightSidebarWidth, 720),
      Math.max(520, config.layout.rightSidebarMinWidth),
      Math.min(MAX_RIGHT_SIDEBAR_WIDTH, Math.max(560, workspaceWidth - leftSidebarWidth - 96))
    )
    const leftPaneWidth = isLeftPaneCollapsed ? config.layout.collapsedRailWidth : leftSidebarWidth
    const rightPaneWidth = isRightPaneCollapsed ? config.layout.collapsedRailWidth : readerPanelWidth
    const leftSplitterWidth = isLeftPaneCollapsed ? 0 : WORKSPACE_SPLITTER_WIDTH
    const rightSplitterWidth = isRightPaneCollapsed ? 0 : WORKSPACE_SPLITTER_WIDTH

    return {
      leftSidebarWidth,
      rightSidebarWidth,
      leftPaneWidth,
      rightPaneWidth,
      leftSplitterWidth,
      rightSplitterWidth,
      style: {
        '--left-pane-size': `${leftPaneWidth}px`,
        '--right-pane-size': `${rightPaneWidth}px`,
        '--left-splitter-size': `${leftSplitterWidth}px`,
        '--right-splitter-size': `${rightSplitterWidth}px`
      } as CSSProperties
    }
  }, [config, isLeftPaneCollapsed, isRightPaneCollapsed, workspaceWidth])

  function clearWorkspacePersistTimer() {
    const pendingTimer = workspacePersistRef.current.timer
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer)
      workspacePersistRef.current.timer = null
    }
  }

  function clearReaderScrollWorkspacePersistTimer() {
    const pendingTimer = readerScrollWorkspacePersistTimerRef.current
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer)
      readerScrollWorkspacePersistTimerRef.current = null
    }
  }

  function scheduleReaderScrollWorkspacePersist() {
    clearReaderScrollWorkspacePersistTimer()
    readerScrollWorkspacePersistTimerRef.current = window.setTimeout(() => {
      readerScrollWorkspacePersistTimerRef.current = null
      scheduleWorkspacePersist({ immediate: true })
    }, READER_SCROLL_REMOTE_PERSIST_DEBOUNCE_MS)
  }

  function resetWorkspacePersistence() {
    workspacePersistEpochRef.current += 1
    clearWorkspacePersistTimer()
    clearReaderScrollWorkspacePersistTimer()
    skipNextConfigAutoPersistRef.current = false
    workspacePersistRef.current.inFlight = false
    workspacePersistRef.current.pendingAfterFlight = false
  }

  function cancelRecordRun(recordId: string) {
    const activeRun = activeRecordRunsRef.current.get(recordId)
    if (!activeRun) {
      return
    }

    activeRun.abort()
    activeRecordRunsRef.current.delete(recordId)
  }

  function cancelAllRecordRuns() {
    for (const controller of activeRecordRunsRef.current.values()) {
      controller.abort()
    }
    activeRecordRunsRef.current.clear()
  }

  function isRecordDeleted(recordId: string) {
    return Boolean(qaRecordsRef.current.find((record) => record.id === recordId)?.lifecycle.isDeleted)
  }

  function scheduleWorkspacePersist(options?: { immediate?: boolean; minDelayMs?: number }) {
    const currentConfig = configRef.current
    const currentCanvas = canvasRef.current
    if (!currentConfig || !currentCanvas) {
      return
    }

    clearWorkspacePersistTimer()
    if (options?.immediate && !options.minDelayMs) {
      workspacePersistRef.current.pendingAfterFlight = true
      void flushWorkspacePersist()
      return
    }

    const delayMs = Math.max(0, options?.minDelayMs ?? currentConfig.storage.autoSaveMs)
    workspacePersistRef.current.timer = window.setTimeout(() => {
      workspacePersistRef.current.timer = null
      void flushWorkspacePersist()
    }, delayMs)
  }

  async function flushWorkspacePersist() {
    const currentConfig = configRef.current
    const currentCanvas = canvasRef.current
    if (!currentConfig || !currentCanvas) {
      return
    }

    if (
      currentConfig === lastPersistedConfigRef.current &&
      currentCanvas === lastPersistedCanvasRef.current
    ) {
      workspacePersistRef.current.pendingAfterFlight = false
      return
    }

    if (workspacePersistRef.current.inFlight) {
      workspacePersistRef.current.pendingAfterFlight = true
      return
    }

    clearWorkspacePersistTimer()
    workspacePersistRef.current.inFlight = true
    workspacePersistRef.current.pendingAfterFlight = false
    setWorkspacePersistUiState((current) => markWorkspacePersistStarted(current))
    const persistEpoch = workspacePersistEpochRef.current
    const submittedConfig = currentConfig
    const submittedCanvas = currentCanvas
    const expectedVersion = workspaceVersionRef.current
    let shouldContinue = false
    let shouldRetry = false
    let retryDelayMs = currentConfig.storage.autoSaveMs

    try {
      const nextVersion = await saveWorkspaceState({
        config: submittedConfig,
        canvas: submittedCanvas,
        version: expectedVersion
      })
      if (persistEpoch !== workspacePersistEpochRef.current) {
        return
      }

      workspaceVersionRef.current = nextVersion
      lastPersistedConfigRef.current = submittedConfig
      lastPersistedCanvasRef.current = submittedCanvas
      setWorkspacePersistUiState(markWorkspacePersistSucceeded())
      shouldContinue =
        configRef.current !== submittedConfig ||
        canvasRef.current !== submittedCanvas ||
        workspacePersistRef.current.pendingAfterFlight
    } catch (persistError) {
      if (persistEpoch !== workspacePersistEpochRef.current) {
        return
      }

      console.error(persistError)
      if (persistError instanceof ApiRequestError && persistError.status === 409) {
        resetWorkspacePersistence()
        void loadWorkspace({ reason: 'conflict-reload' })
        return
      }

      setWorkspacePersistUiState((current) =>
        markWorkspacePersistFailed(current, describeWorkspacePersistError(persistError, t))
      )
      retryDelayMs = resolveWorkspacePersistRetryDelayMs(persistError, currentConfig.storage.autoSaveMs)
      shouldRetry =
        shouldAutoRetryWorkspacePersist(persistError) &&
        (configRef.current !== lastPersistedConfigRef.current ||
          canvasRef.current !== lastPersistedCanvasRef.current)
    } finally {
      if (persistEpoch !== workspacePersistEpochRef.current) {
        return
      }

      workspacePersistRef.current.inFlight = false
      workspacePersistRef.current.pendingAfterFlight = false

      if (shouldContinue) {
        scheduleWorkspacePersist({ immediate: true })
      } else if (shouldRetry) {
        scheduleWorkspacePersist({ minDelayMs: retryDelayMs })
      }
    }
  }

  async function loadWorkspace(options?: { reason?: 'initial' | 'manual' | 'conflict-reload' }) {
    clearReaderScrollPersistTimer()
    resetWorkspacePersistence()
    cancelAllRecordRuns()
    if (options?.reason !== 'conflict-reload') {
      setWorkspacePersistUiState(createWorkspacePersistUiState())
    }

    try {
      setLoading(true)
      setError(null)
      setLlmAccess(null)
      setRepositoryBinding(null)
      const snapshot = await bootstrapWorkspace()
      const normalizedCanvas = normalizeCanvasState(snapshot.canvas)
      const nextConfig = {
        ...snapshot.config,
        templates: applyPromptTemplateDefaults(snapshot.config.templates)
      }
      workspaceVersionRef.current = snapshot.workspaceVersion ?? 0
      configRef.current = nextConfig
      lastPersistedConfigRef.current = nextConfig
      canvasRef.current = normalizedCanvas
      lastPersistedCanvasRef.current = normalizedCanvas
      qaRecordsRef.current = snapshot.qaRecords
      setDataRoot(snapshot.dataRoot)
      setRepo(snapshot.repo)
      setDocuments(snapshot.documents)
      setSidebarNodes(snapshot.sidebarNodes)
      setConfig(nextConfig)
      setCanvas(normalizedCanvas)
      setQaRecords(snapshot.qaRecords)
      setLlmAccess(snapshot.llmAccess ?? null)
      setRepositoryBinding(snapshot.repositoryBinding)
      setWorkspacePersistUiState(
        options?.reason === 'conflict-reload'
          ? markWorkspacePersistConflictReloaded()
          : createWorkspacePersistUiState()
      )
    } catch (loadError) {
      console.error(loadError)
      setLlmAccess(null)
      setError(describeWorkspaceError(loadError, t))
    } finally {
      setLoading(false)
    }
  }

  function clearReaderScrollPersistTimer() {
    const pendingTimer = readerScrollPersistTimerRef.current
    if (pendingTimer !== null) {
      window.clearTimeout(pendingTimer)
      readerScrollPersistTimerRef.current = null
    }
  }

  function persistReaderScrollPosition(documentPath: string | undefined, scrollTop: number, options?: { persistImmediately?: boolean }) {
    if (!documentPath || !Number.isFinite(scrollTop)) {
      return
    }

    const currentConfig = configRef.current
    if (!currentConfig) {
      return
    }

    const normalizedScrollTop = Math.max(0, Math.round(scrollTop))
    if (currentConfig.navigation.readerScrollPositions[documentPath] === normalizedScrollTop) {
      if (options?.persistImmediately) {
        clearReaderScrollWorkspacePersistTimer()
        scheduleWorkspacePersist({ immediate: true })
      }
      return
    }

    const nextConfig: AppConfig = {
      ...currentConfig,
      navigation: {
        ...currentConfig.navigation,
        readerScrollPositions: {
          ...currentConfig.navigation.readerScrollPositions,
          [documentPath]: normalizedScrollTop
        }
      }
    }

    configRef.current = nextConfig
    if (!options?.persistImmediately) {
      skipNextConfigAutoPersistRef.current = true
    }
    setConfig(nextConfig)

    if (options?.persistImmediately) {
      clearReaderScrollWorkspacePersistTimer()
      scheduleWorkspacePersist({ immediate: true })
      return
    }

    scheduleReaderScrollWorkspacePersist()
  }

  function flushReaderScrollPosition(documentPath = currentDocument?.path, options?: { persistImmediately?: boolean }) {
    clearReaderScrollPersistTimer()
    persistReaderScrollPosition(documentPath, readerScrollRef.current?.scrollTop ?? 0, options)
  }

  function updateConfig(updater: (config: AppConfig) => AppConfig) {
    setConfig((previous) => {
      const next = previous ? updater(previous) : previous
      configRef.current = next
      return next
    })
  }

  function resolveFontPane(target: FontPaneTarget): FontPaneTarget {
    if (target !== 'widget') {
      return 'reader'
    }

    if (isMobilePortraitLayout) {
      return mobilePortraitPane === 'right' ? 'widget' : 'reader'
    }

    return !isRightPaneCollapsed ? 'widget' : 'reader'
  }

  function setActiveFontPane(target: FontPaneTarget) {
    lastFontPaneRef.current = resolveFontPane(target)
  }

  function selectMobilePortraitPane(pane: MobilePortraitPane) {
    setMobilePortraitPane(pane)
    lastFontPaneRef.current = pane === 'right' ? 'widget' : 'reader'
  }

  function updatePaneFont(target: FontPaneTarget, updater: (current: number) => number) {
    const resolvedTarget = resolveFontPane(target)
    lastFontPaneRef.current = resolvedTarget
    const fontKey = resolvedTarget === 'widget' ? 'widgetFontPx' : 'readerFontPx'

    updateConfig((draft) => ({
      ...draft,
      rendering: {
        ...draft.rendering,
        [fontKey]: clamp(updater(draft.rendering[fontKey]), MIN_CONTENT_FONT_PX, MAX_CONTENT_FONT_PX)
      }
    }))
  }

  function adjustPaneFont(target: FontPaneTarget, delta: number) {
    if (!delta) {
      return
    }
    updatePaneFont(target, (current) => current + delta)
  }

  function resetPaneFont(target: FontPaneTarget) {
    updatePaneFont(target, () => DEFAULT_CONTENT_FONT_PX)
  }

  function adjustActivePaneFont(delta: number) {
    adjustPaneFont(lastFontPaneRef.current, delta)
  }

  function resetActivePaneFont() {
    resetPaneFont(lastFontPaneRef.current)
  }

  function handlePaneFontWheel(target: FontPaneTarget, event: ReactWheelEvent<HTMLElement>) {
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) {
      return
    }

    event.preventDefault()
    setActiveFontPane(target)
    adjustPaneFont(target, event.deltaY < 0 ? 1 : -1)
  }

  function commitCanvas(nextCanvas: CanvasState, options?: { persistImmediately?: boolean }) {
    const normalizedCanvas = normalizeCanvasState(nextCanvas)
    canvasRef.current = normalizedCanvas
    setCanvas(normalizedCanvas)
    if (options?.persistImmediately) {
      scheduleWorkspacePersist({ immediate: true })
    }
  }

  function updateCanvas(updater: (canvas: CanvasState) => CanvasState, options?: { persistImmediately?: boolean }) {
    const previous = canvasRef.current
    if (!previous) {
      return
    }

    const next = updater(previous)
    commitCanvas(next, options)
  }

  function setLeftSidebarCollapsed(collapsed: boolean) {
    updateConfig((draft) => ({
      ...draft,
      layout: {
        ...draft.layout,
        leftSidebarCollapsed: collapsed
      }
    }))
  }

  function setRightSidebarCollapsed(collapsed: boolean) {
    updateConfig((draft) => ({
      ...draft,
      layout: {
        ...draft.layout,
        rightSidebarCollapsed: collapsed
      }
    }))
  }

  function toggleSidebarFolder(folderId: string) {
    updateConfig((draft) => {
      const collapsedSidebarFolderIds = toggleCollapsedSidebarFolderId(
        draft.navigation.collapsedSidebarFolderIds,
        folderId,
        sidebarNodes
      )

      if (areStringArraysEqual(collapsedSidebarFolderIds, draft.navigation.collapsedSidebarFolderIds)) {
        return draft
      }

      return {
        ...draft,
        navigation: {
          ...draft.navigation,
          collapsedSidebarFolderIds
        }
      }
    })
  }

  function expandRightSidebar() {
    if (!isRightPaneCollapsed) {
      return
    }
    setRightSidebarCollapsed(false)
  }

  function ensureWidgetVisibleInCanvas(widgetId: string) {
    updateCanvas((draft) => {
      const widget = draft.widgetStates.find((candidate) => candidate.id === widgetId)
      if (!widget) {
        return draft
      }

      const normalizedViewport = normalizeCanvasViewport(draft.viewport)
      const baseCanvas = sameCanvasViewport(draft.viewport, normalizedViewport)
        ? draft
        : {
            ...draft,
            viewport: normalizedViewport
          }

      if (isMobilePortraitLayout) {
        const nextViewport = frameWidgetInCanvasViewport(baseCanvas, widget, resolvedCanvasViewportSize)
        if (sameCanvasViewport(baseCanvas.viewport, nextViewport)) {
          return baseCanvas === draft ? draft : { ...baseCanvas, updatedAt: new Date().toISOString() }
        }

        return {
          ...baseCanvas,
          viewport: nextViewport,
          updatedAt: new Date().toISOString()
        }
      }

      const nextWidget = placeWidgetInExposedCanvasArea(baseCanvas, widget)
      if (sameWidgetGeometry(widget, nextWidget)) {
        return baseCanvas === draft ? draft : { ...baseCanvas, updatedAt: new Date().toISOString() }
      }

      return {
        ...baseCanvas,
        widgetStates: baseCanvas.widgetStates.map((candidate) => (candidate.id === widgetId ? nextWidget : candidate)),
        updatedAt: new Date().toISOString()
      }
    })
  }

  function openWidgetInRightPane(factory: (draft: CanvasState) => WidgetState, options?: { persistImmediately?: boolean }) {
    if (isMobilePortraitLayout) {
      selectMobilePortraitPane('right')
    } else {
      expandRightSidebar()
    }
    updateCanvas((draft) => {
      const widget = isMobilePortraitLayout
        ? ensureWidgetVisible(draft, factory(draft), resolvedCanvasViewportSize)
        : placeWidgetInExposedCanvasArea(draft, factory(draft))
      return {
        ...draft,
        widgetStates: [...draft.widgetStates, widget],
        selection: {
          widgetId: widget.id
        },
        updatedAt: new Date().toISOString()
      }
    }, options)
  }

  function placeWidgetInExposedCanvasArea(draft: CanvasState, widget: WidgetState): WidgetState {
    if (!layoutMetrics || workspaceWidth <= 0) {
      return ensureWidgetVisible(draft, widget, resolvedCanvasViewportSize)
    }

    const viewport = normalizeCanvasViewport(draft.viewport)
    const zoom = viewport.zoom
    const leftChromeWidth = isLeftPaneCollapsed
      ? layoutMetrics.leftPaneWidth
      : layoutMetrics.leftPaneWidth + layoutMetrics.leftSplitterWidth
    const readerChromeWidth = isRightPaneCollapsed
      ? layoutMetrics.rightPaneWidth
      : layoutMetrics.rightPaneWidth + layoutMetrics.rightSplitterWidth
    const exposedLeft = Math.min(workspaceWidth - 80, leftChromeWidth + readerChromeWidth + 28)
    const exposedWidth = Math.max(320, workspaceWidth - exposedLeft - 28)
    const size = {
      w: Math.min(widget.size.w, Math.max(320, exposedWidth)),
      h: widget.size.h
    }
    const widgetIndex = draft.widgetStates.length % 6
    const targetScreenX = exposedLeft + widgetIndex * 18
    const targetScreenY = 56 + widgetIndex * 18

    return {
      ...widget,
      size,
      position: {
        x: Math.round((targetScreenX - viewport.x) / zoom),
        y: Math.round((targetScreenY - viewport.y) / zoom)
      }
    }
  }

  function focusWidget(widgetId: string, options?: { ensureVisible?: boolean }) {
    if (isMobilePortraitLayout) {
      selectMobilePortraitPane('right')
    }

    if (options?.ensureVisible && !isMobilePortraitLayout) {
      expandRightSidebar()
    }

    updateCanvas((draft) => {
      const activeWidget = draft.widgetStates.find((widget) => widget.id === widgetId)
      if (!activeWidget) {
        return draft
      }

      const nextZIndex = Math.max(0, ...draft.widgetStates.map((widget) => widget.zIndex)) + 1
      const maybeVisibleWidget = options?.ensureVisible
        ? isMobilePortraitLayout
          ? ensureWidgetVisible(
              draft,
              {
                ...activeWidget,
                zIndex: nextZIndex
              },
              resolvedCanvasViewportSize
            )
          : placeWidgetInExposedCanvasArea(draft, {
              ...activeWidget,
              zIndex: nextZIndex
            })
        : null
      const widgetStates = draft.widgetStates.map((widget) => {
        if (widget.id !== widgetId) {
          return widget
        }

        return maybeVisibleWidget ?? {
          ...widget,
          zIndex: nextZIndex
        }
      })

      return {
        ...draft,
        widgetStates,
        selection: {
          widgetId
        },
        updatedAt: new Date().toISOString()
      }
    })
  }

  function updateWidget(
    widgetId: string,
    updater: (widget: WidgetState) => WidgetState,
    options?: { persistImmediately?: boolean }
  ) {
    updateCanvas((draft) => ({
      ...draft,
      widgetStates: draft.widgetStates.map((widget) => (widget.id === widgetId ? updater(widget) : widget)),
      updatedAt: new Date().toISOString()
    }), options)
  }

  function removeWidgetIdsFromCanvas(draft: CanvasState, widgetIds: string[]) {
    const removedIds = new Set(widgetIds)
    const selectedWidgetId = draft.selection?.widgetId ?? null

    return {
      ...draft,
      widgetStates: draft.widgetStates.filter((widget) => !removedIds.has(widget.id)),
      selection: {
        widgetId: selectedWidgetId && removedIds.has(selectedWidgetId) ? null : selectedWidgetId
      },
      updatedAt: new Date().toISOString()
    }
  }

  function closeWidget(widgetId: string) {
    setContextModalTarget((previous) =>
      previous?.kind === 'ask-widget' && previous.widgetId === widgetId ? null : previous
    )
    updateCanvas((draft) => removeWidgetIdsFromCanvas(draft, [widgetId]))
  }

  function upsertRecord(record: QARecord) {
    setQaRecords((previous) => {
      const next = upsertQaRecord(previous, record)
      qaRecordsRef.current = next
      return next
    })
  }

  function openDocument(documentId: string) {
    const nextDocument = documentMap.get(documentId) ?? null

    flushReaderScrollPosition(currentDocument?.path, { persistImmediately: true })

    if (isMobilePortraitLayout) {
      selectMobilePortraitPane('reader')
    }

    if (isRemoteRepo && nextDocument && !nextDocument.isContentLoaded && remoteLibraryId) {
      if (!remoteDocumentLoadsRef.current.has(documentId)) {
        remoteDocumentLoadsRef.current.add(documentId)
        void fetchRemoteDocument(documentId, remoteLibraryId)
          .then((loadedDocument) => {
            setDocuments((previous) =>
              previous.map((document) => (document.id === loadedDocument.id ? loadedDocument : document))
            )
          })
          .catch((error) => {
            console.error(error)
            setError(describeWorkspaceError(error, t))
          })
          .finally(() => {
            remoteDocumentLoadsRef.current.delete(documentId)
          })
      }
    }

    setRepo((previous) =>
      previous
        ? {
            ...previous,
            currentDocumentId: documentId,
            updatedAt: new Date().toISOString()
          }
        : previous
    )
    if (nextDocument) {
      updateConfig((draft) => ({
        ...draft,
        repository: {
          ...draft.repository,
          lastOpenedDocumentPath: nextDocument.path
        }
      }))
    }
  }

  function handleReaderScroll() {
    const documentPath = currentDocument?.path
    if (!documentPath) {
      return
    }

    clearReaderScrollPersistTimer()
    readerScrollPersistTimerRef.current = window.setTimeout(() => {
      readerScrollPersistTimerRef.current = null
      flushReaderScrollPosition(documentPath)
    }, READER_SCROLL_SAVE_DEBOUNCE_MS)
  }

  useEffect(() => {
    if (!currentDocument) {
      return
    }

    const savedScrollTop = configRef.current?.navigation.readerScrollPositions[currentDocument.path] ?? 0
    const frameId = window.requestAnimationFrame(() => {
      const readerScroll = readerScrollRef.current
      if (!readerScroll) {
        return
      }

      readerScroll.scrollTop = Math.max(0, savedScrollTop)
    })

    return () => window.cancelAnimationFrame(frameId)
  }, [currentDocument])

  useEffect(() => {
    const flushCurrentDocumentScroll = () => flushReaderScrollPosition(currentDocument?.path, { persistImmediately: true })
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushCurrentDocumentScroll()
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', flushCurrentDocumentScroll)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', flushCurrentDocumentScroll)
    }
  }, [currentDocument])

  const updateQuickErrataDraft = (patch: Partial<QuickErrataFormFields>) =>
    setQuickErrataDraft((current) => ({
      ...current,
      ...patch,
      idempotencyKey: createId('errata-ticket')
    }))

  function openQuickErrataFromAskMenu() {
    if (auth.status !== 'signed_in') {
      window.location.replace(buildLoginPath(`${window.location.pathname}${window.location.search}`))
      return
    }

    if (!repo || !config || !currentDocument || !askMenu || !remoteLibraryId || !remoteRevisionId) {
      return
    }

    const action = askMenu.session.action
    const targetDocumentId = action.target.documentId ?? currentDocument.id
    const targetDocument = documentMap.get(targetDocumentId) ?? currentDocument
    const errataAction: AskSelection = {
      ...action,
      contextMode: 'paragraph'
    }

    setAskMenu(null)
    setContextModalTarget(null)
    setQuickErrataTarget({
      documentId: targetDocument.id,
      documentTitle: targetDocument.title.trim() || targetDocument.path,
      documentPath: targetDocument.path
    })
    setQuickErrataDraft(
      createQuickErrataDraft({
        selectionQuote: action.selection.text.trim(),
        selectionContext: buildContextSnapshot({
          action: errataAction,
          contextMode: 'paragraph',
          repo,
          documents,
          config
        })
      })
    )
    setQuickErrataError(null)
    setQuickErrataSubmitted(false)
    setQuickErrataOpen(true)
  }

  async function submitQuickErrata() {
    if (!quickErrataTarget || !remoteLibraryId || !remoteRevisionId) {
      return
    }

    if (auth.status !== 'signed_in') {
      window.location.replace(buildLoginPath(`${window.location.pathname}${window.location.search}`))
      return
    }

    setQuickErrataSubmitting(true)
    setQuickErrataError(null)

    try {
      await createLibraryErrataTicket(remoteLibraryId, {
        idempotencyKey: quickErrataDraft.idempotencyKey,
        revisionId: remoteRevisionId,
        documentId: quickErrataTarget.documentId,
        documentPath: quickErrataTarget.documentPath,
        title: quickErrataDraft.title.trim(),
        description: quickErrataDraft.description.trim(),
        severity: quickErrataDraft.severity,
        selectionQuote: quickErrataDraft.selectionQuote.trim() || undefined,
        selectionContext: quickErrataDraft.selectionContext.trim() || undefined,
        proposedFix: quickErrataDraft.proposedFix.trim() || undefined
      })
      setQuickErrataSubmitted(true)
      setQuickErrataDraft((current) => ({
        ...current,
        idempotencyKey: createId('errata-ticket')
      }))
    } catch (submitError) {
      if (submitError instanceof ApiRequestError && submitError.status === 401) {
        window.location.replace(buildLoginPath(`${window.location.pathname}${window.location.search}`))
        return
      }

      setQuickErrataError(
        submitError instanceof Error ? submitError.message : t('app.quickErrata.error.submitFailed')
      )
    } finally {
      setQuickErrataSubmitting(false)
    }
  }

  function beginSidebarResize(side: 'left' | 'right', event: React.PointerEvent<HTMLButtonElement>) {
    if (!config) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    const resizeHandle = event.currentTarget
    if (typeof resizeHandle.setPointerCapture === 'function') {
      try {
        resizeHandle.setPointerCapture(event.pointerId)
      } catch {
        // Some mobile browsers can reject capture if the pointer is already transitioning.
      }
    }

    const startX = event.clientX
    const originWidth = side === 'left' ? config.layout.leftSidebarWidth : (layoutMetrics?.rightPaneWidth ?? config.layout.rightSidebarWidth)
    const minWidth = side === 'left' ? config.layout.leftSidebarMinWidth : config.layout.rightSidebarMinWidth
    const otherPaneWidth =
      side === 'left'
        ? isRightPaneCollapsed
          ? config.layout.collapsedRailWidth
          : config.layout.rightSidebarWidth
        : isLeftPaneCollapsed
          ? config.layout.collapsedRailWidth
          : config.layout.leftSidebarWidth
    const otherSplitterWidth =
      side === 'left'
        ? isRightPaneCollapsed
          ? 0
          : WORKSPACE_SPLITTER_WIDTH
        : isLeftPaneCollapsed
          ? 0
          : WORKSPACE_SPLITTER_WIDTH
    const layoutBound =
      workspaceWidth > 0
        ? workspaceWidth - otherPaneWidth - otherSplitterWidth - WORKSPACE_SPLITTER_WIDTH - MIN_READER_PANE_WIDTH
        : Number.POSITIVE_INFINITY
    const maxWidth = Math.max(
      minWidth,
      Math.min(side === 'left' ? MAX_LEFT_SIDEBAR_WIDTH : MAX_RIGHT_SIDEBAR_WIDTH, layoutBound)
    )
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    const originCollapsed = side === 'left' ? isLeftPaneCollapsed : isRightPaneCollapsed
    let lastRawWidth = originWidth
    let lastClampedWidth = originWidth
    let lastCollapsed = originCollapsed

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'

    const move = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientX - startX
      const proposedWidth = originWidth + delta
      const clampedWidth = clamp(proposedWidth, minWidth, maxWidth)
      lastRawWidth = proposedWidth
      lastClampedWidth = clampedWidth
      const shouldCollapse = proposedWidth <= minWidth - SIDEBAR_COLLAPSE_DRAG_THRESHOLD
      const nextCollapsed = shouldCollapse

      if (nextCollapsed !== lastCollapsed) {
        lastCollapsed = nextCollapsed
      }

      updateConfig((draft) => ({
        ...draft,
        layout: {
          ...draft.layout,
          leftSidebarCollapsed: side === 'left' ? nextCollapsed : draft.layout.leftSidebarCollapsed,
          rightSidebarCollapsed: side === 'right' ? nextCollapsed : draft.layout.rightSidebarCollapsed,
          leftSidebarWidth: side === 'left' ? clampedWidth : draft.layout.leftSidebarWidth,
          rightSidebarWidth: side === 'right' ? clampedWidth : draft.layout.rightSidebarWidth
        }
      }))
    }

    const finish = (commitResize: boolean) => {
      if (
        typeof resizeHandle.releasePointerCapture === 'function' &&
        typeof resizeHandle.hasPointerCapture === 'function' &&
        resizeHandle.hasPointerCapture(event.pointerId)
      ) {
        try {
          resizeHandle.releasePointerCapture(event.pointerId)
        } catch {
          // Ignore release failures during teardown.
        }
      }

      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', commitResizeAndCleanup)
      window.removeEventListener('pointercancel', cancelResizeAndCleanup)

      if (!commitResize) {
        updateConfig((draft) => ({
          ...draft,
          layout: {
            ...draft.layout,
            leftSidebarCollapsed: side === 'left' ? originCollapsed : draft.layout.leftSidebarCollapsed,
            rightSidebarCollapsed: side === 'right' ? originCollapsed : draft.layout.rightSidebarCollapsed,
            leftSidebarWidth: side === 'left' ? originWidth : draft.layout.leftSidebarWidth,
            rightSidebarWidth: side === 'right' ? originWidth : draft.layout.rightSidebarWidth
          }
        }))
        return
      }

      updateConfig((draft) => ({
        ...draft,
        layout: {
          ...draft.layout,
          leftSidebarCollapsed: side === 'left' ? lastCollapsed : draft.layout.leftSidebarCollapsed,
          rightSidebarCollapsed: side === 'right' ? lastCollapsed : draft.layout.rightSidebarCollapsed,
          leftSidebarWidth: side === 'left' ? lastClampedWidth : draft.layout.leftSidebarWidth,
          rightSidebarWidth: side === 'right' ? lastClampedWidth : draft.layout.rightSidebarWidth
        }
      }))
    }

    const commitResizeAndCleanup = () => finish(true)
    const cancelResizeAndCleanup = () => finish(false)

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', commitResizeAndCleanup)
    window.addEventListener('pointercancel', cancelResizeAndCleanup)
  }

  function openContextSettings() {
    if (askMenu) {
      setContextModalTarget({
        kind: 'ask-menu'
      })
      return
    }

    if (focusedEditableAskWidget) {
      setContextModalTarget({
        kind: 'ask-widget',
        widgetId: focusedEditableAskWidget.id
      })
      return
    }

    setContextModalTarget({
      kind: 'next-ask'
    })
  }

  function openAskMenu(selection: AskSelection) {
    if (!config) {
      return
    }

    const action: AskSelection = {
      ...selection,
      learningPrompt: selection.learningPrompt ?? config.learning.prompt
    }
    const preparedAction: AskSelection = {
      ...action,
      contextMode: resolveContextMode(action, config, nextAskContextMode ?? action.contextMode)
    }

    setAskMenu({
      session: buildPendingAskSession(preparedAction),
      hoveredTemplateId: sortedTemplates[0]?.id ?? null
    })
    setNextAskContextMode(null)
  }

  function updateAskMenuContextMode(mode: ReadingContextMode) {
    if (!config) {
      return
    }

    setAskMenu((previous) =>
      previous
        ? {
            ...previous,
            session: {
              ...previous.session,
              action: {
                ...previous.session.action,
                contextMode: resolveContextMode(previous.session.action, config, mode)
              }
            }
          }
        : previous
    )
  }

  function updateAskMenuLearningPrompt(prompt: string) {
    setAskMenu((previous) =>
      previous
        ? {
            ...previous,
            session: {
              ...previous.session,
              action: {
                ...previous.session.action,
                learningPrompt: prompt
              }
            }
          }
        : previous
    )
  }

  function updateCustomAskWidgetContextMode(widgetId: string, mode: ReadingContextMode) {
    if (!config || !repo) {
      return
    }

    updateWidget(widgetId, (candidate) => {
      if (candidate.type !== 'ask' || !candidate.props.pendingSession) {
        return candidate
      }

      const action: AskSelection = {
        ...candidate.props.pendingSession.action,
        contextMode: resolveContextMode(candidate.props.pendingSession.action, config, mode)
      }
      const preview = buildContextPreview({
        action,
        config,
        repo,
        documents
      })

      return {
        ...candidate,
        props: {
          ...candidate.props,
          pendingSession: {
            ...candidate.props.pendingSession,
            action
          },
          contextPreview: preview
        }
      }
    })
  }

  function updateCustomAskWidgetLearningPrompt(widgetId: string, prompt: string) {
    if (!config || !repo) {
      return
    }

    updateWidget(widgetId, (candidate) => {
      if (candidate.type !== 'ask' || !candidate.props.pendingSession) {
        return candidate
      }

      const action: AskSelection = {
        ...candidate.props.pendingSession.action,
        learningPrompt: prompt
      }
      const preview = buildContextPreview({
        action,
        config,
        repo,
        documents
      })

      return {
        ...candidate,
        props: {
          ...candidate.props,
          pendingSession: {
            ...candidate.props.pendingSession,
            action
          },
          contextPreview: preview
        }
      }
    })
  }

  function openRecordWidget(recordId: string) {
    if (!canvas) {
      return
    }
    const existing = canvas.widgetStates.find(
      (widget) =>
        (widget.type === 'ask' && widget.props.linkedQaRecordId === recordId) ||
        (widget.type === 'qa-record' && widget.props.qaRecordId === recordId)
    )
    if (existing) {
      focusWidget(existing.id, {
        ensureVisible: true
      })
      return
    }

    openWidgetInRightPane((draft) => ({
      ...nextWidgetFrame(draft, resolvedCanvasViewportSize),
      type: 'qa-record',
      props: {
        qaRecordId: recordId
      }
    }))
  }

  function handleTemplateAsk(template: PromptTemplate) {
    if (!config || !canvas || !repo || !askMenu) {
      return
    }

    const selection = askMenu.session.action
    setAskMenu(null)
    setContextModalTarget(null)

    const widgetId = createId('widget')
    const record = createPendingRecord({
      action: selection,
      config,
      repo,
      documents,
      canvasId: canvas.id || MAIN_CANVAS_ID,
      template,
      sourceParentRecord: selection.sourceQaRecordId
        ? activeRecords.find((candidate) => candidate.id === selection.sourceQaRecordId) ?? null
        : null
    })

    upsertRecord(record)
    void saveQaRecord(record).catch(console.error)
    openWidgetInRightPane((draft) => ({
      ...nextWidgetFrame(draft, resolvedCanvasViewportSize),
      id: widgetId,
      type: 'qa-record',
      props: {
        qaRecordId: record.id
      }
    }), {
      persistImmediately: true
    })

    void runRecord(record)
  }

  function handleCustomAsk() {
    if (!config || !canvas || !repo || !askMenu) {
      return
    }

    const session = askMenu.session
    setAskMenu(null)
    setContextModalTarget(null)

    const widgetId = createId('widget')
    const preview = buildContextPreview({
      action: session.action,
      config,
      repo,
      documents
    })

    openWidgetInRightPane((draft) => ({
      ...nextWidgetFrame(draft, resolvedCanvasViewportSize),
      id: widgetId,
      type: 'ask',
      props: {
        mode: 'custom',
        pendingSession: session,
        draftPrompt: '',
        contextPreview: preview,
        requestState: 'editing'
      }
    }))
  }

  async function submitCustomAsk(widgetId: string, draftPrompt: string) {
    if (!config || !repo || !canvas) {
      return
    }
    const widget = canvas?.widgetStates.find((candidate) => candidate.id === widgetId)
    if (!widget || widget.type !== 'ask' || !widget.props.pendingSession) {
      return
    }

    const action: AskSelection = {
      ...widget.props.pendingSession.action,
      customPrompt: draftPrompt
    }
    const record = createPendingRecord({
      action,
      config,
      repo,
      documents,
      canvasId: canvas.id || MAIN_CANVAS_ID,
      template: null,
      sourceParentRecord: action.sourceQaRecordId
        ? activeRecords.find((candidate) => candidate.id === action.sourceQaRecordId) ?? null
        : null
    })

    upsertRecord(record)
    void saveQaRecord(record).catch(console.error)
    updateWidget(
      widgetId,
      (candidate) =>
        candidate.type === 'ask'
          ? {
              ...candidate,
              type: 'qa-record',
              props: {
                qaRecordId: record.id
              }
            }
          : candidate,
      {
        persistImmediately: true
      }
    )
    setContextModalTarget((previous) =>
      previous?.kind === 'ask-widget' && previous.widgetId === widgetId ? null : previous
    )

    await runRecord(record)
  }

  async function runRecord(seedRecord: QARecord) {
    if (!config) {
      return
    }
    cancelRecordRun(seedRecord.id)
    const abortController = new AbortController()
    activeRecordRunsRef.current.set(seedRecord.id, abortController)
    const startedAt = Date.now()
    let streamedText = seedRecord.answerMarkdown
    let firstTokenAt: string | undefined
    let resolvedModelInfo: QARecord['modelInfo'] = buildModelInfo(config, {
      displayName: selectedLlmModel?.displayName ?? selectedLlmModel?.model ?? config.provider.model,
      model: selectedLlmModel?.model ?? config.provider.model,
      modelId: selectedLlmModel?.id ?? (config.provider.model || undefined),
      cost: selectedLlmModel?.cost,
      remainingCredits: llmAccess?.creditBalance,
      permanentBalance: llmAccess?.permanentBalance,
      dailyQuota: llmAccess?.dailyQuota,
      dailyUsed: llmAccess?.dailyUsed,
      dailyRemaining: llmAccess?.dailyRemaining,
      quotaDate: llmAccess?.quotaDate,
      subscription: llmAccess?.subscription
    })

    try {
      for await (const chunk of streamAnswer({
        config,
        qaRecord: seedRecord,
        signal: abortController.signal,
        onModelInfo: (modelInfo) => {
          resolvedModelInfo = modelInfo
          if (typeof modelInfo.remainingCredits === 'number' && Number.isFinite(modelInfo.remainingCredits)) {
            setLlmAccess((current) =>
              current
                ? {
                    ...current,
                    creditBalance: modelInfo.remainingCredits ?? current.creditBalance,
                    permanentBalance: modelInfo.permanentBalance ?? current.permanentBalance,
                    dailyQuota: modelInfo.dailyQuota ?? current.dailyQuota,
                    dailyUsed: modelInfo.dailyUsed ?? current.dailyUsed,
                    dailyRemaining: modelInfo.dailyRemaining ?? current.dailyRemaining,
                    quotaDate: modelInfo.quotaDate ?? current.quotaDate,
                    subscription: modelInfo.subscription ?? current.subscription
                  }
                : current
            )
          }
        }
      })) {
        if (abortController.signal.aborted || isRecordDeleted(seedRecord.id)) {
          return
        }

        if (!firstTokenAt) {
          firstTokenAt = new Date().toISOString()
        }

        streamedText += chunk
        const streamingRecord: QARecord = {
          ...seedRecord,
          answerMarkdown: streamedText,
          answerStatus: 'streaming',
          modelInfo: resolvedModelInfo,
          timing: {
            ...seedRecord.timing,
            firstTokenAt
          },
          updatedAt: new Date().toISOString()
        }

        upsertRecord(streamingRecord)
      }

      if (abortController.signal.aborted || isRecordDeleted(seedRecord.id)) {
        return
      }

      const finalRecord: QARecord = {
        ...seedRecord,
        answerMarkdown: streamedText,
        answerStatus: 'done',
        modelInfo: resolvedModelInfo,
        timing: {
          ...seedRecord.timing,
          firstTokenAt,
          completedAt: new Date().toISOString(),
          durationMs: Date.now() - startedAt
        },
        updatedAt: new Date().toISOString()
      }

      upsertRecord(finalRecord)
      await saveQaRecord(finalRecord)
    } catch (streamError) {
      if (abortController.signal.aborted || isAbortError(streamError) || isRecordDeleted(seedRecord.id)) {
        return
      }

      console.error(streamError)
      const fallbackMessage =
        streamError instanceof Error && streamError.message.trim().length > 0
          ? streamError.message
          : t('app.answerFallback.requestFailed')
      const erroredRecord: QARecord = {
        ...seedRecord,
        answerMarkdown: streamedText || fallbackMessage,
        answerStatus: 'error',
        modelInfo: resolvedModelInfo,
        timing: {
          ...seedRecord.timing,
          firstTokenAt
        },
        updatedAt: new Date().toISOString()
      }
      upsertRecord(erroredRecord)
      await saveQaRecord(erroredRecord)
    } finally {
      if (activeRecordRunsRef.current.get(seedRecord.id) === abortController) {
        activeRecordRunsRef.current.delete(seedRecord.id)
      }
    }
  }

  async function removeRecord(recordId: string) {
    cancelRecordRun(recordId)

    const record = qaRecordsRef.current.find((candidate) => candidate.id === recordId)
    if (!record) {
      return
    }

    const deletedRecord: QARecord = {
      ...record,
      lifecycle: {
        ...record.lifecycle,
        isDeleted: true,
        deletedAt: new Date().toISOString()
      },
      updatedAt: new Date().toISOString()
    }

    upsertRecord(deletedRecord)

    await deleteQaRecord(deletedRecord)
    updateCanvas((draft) =>
      removeWidgetIdsFromCanvas(
        draft,
        draft.widgetStates
          .filter((widget) => {
            if (widget.type === 'ask') {
              return widget.props.linkedQaRecordId === recordId
            }
            return widget.props.qaRecordId === recordId
          })
          .map((widget) => widget.id)
      )
    )
  }

  if (loading) {
    return (
      <div className="boot-screen">
        <div className="boot-card">
          <span className="boot-kicker">十二问 AnyReader</span>
          <h1>{t('app.loading.title')}</h1>
          <p>{t('app.loading.body')}</p>
        </div>
      </div>
    )
  }

  if (error || !repo || !config || !canvas || !currentDocument || !repositoryBinding) {
    return (
      <div className="boot-screen">
        <div className="boot-card error-card">
          <span className="boot-kicker">{t('app.error.kicker')}</span>
          <h1>{t('app.error.title')}</h1>
          <p>{error ?? t('app.error.bodyMissingState')}</p>
          <div className="boot-actions">
            <button className="primary-button" onClick={() => void loadWorkspace({ reason: 'manual' })}>
              {t('shared.action.reload')}
            </button>
            <a className="ghost-button" href={bootLibrariesPath}>
              {t('shared.action.backToLibraries')}
            </a>
          </div>
        </div>
      </div>
    )
  }

  const shouldRenderReaderTitle = !markdownStartsWithHeading(currentDocument.contentMd) && currentDocument.title.trim().length > 0
  const leftPaneMobileClass = isMobilePortraitLayout
    ? mobilePortraitPane === 'left'
      ? ' is-mobile-pane-active'
      : ' is-mobile-pane-hidden'
    : ''
  const readerPaneMobileClass = isMobilePortraitLayout
    ? mobilePortraitPane === 'reader'
      ? ' is-mobile-pane-active'
      : ' is-mobile-pane-hidden'
    : ''
  const rightPaneMobileClass = isMobilePortraitLayout
    ? mobilePortraitPane === 'right'
      ? ' is-mobile-pane-active'
      : ' is-mobile-pane-hidden'
    : ''

  return (
    <div className={`app-shell${isMobilePortraitLayout ? ' app-shell--mobile-portrait' : ''}`}>
      {isMobilePortraitLayout ? (
        <header className="app-topbar app-topbar--mobile-portrait">
          <div className="mobile-pane-switcher" role="group" aria-label={t('app.mobilePaneSwitcher.label')}>
                  <button
                    type="button"
              className={`mobile-pane-switcher__button${mobilePortraitPane === 'left' ? ' is-active' : ''}`}
              aria-pressed={mobilePortraitPane === 'left'}
              onClick={() => selectMobilePortraitPane('left')}
            >
              {t('app.mobilePane.left')}
            </button>
            <button
              type="button"
              className={`mobile-pane-switcher__button${mobilePortraitPane === 'reader' ? ' is-active' : ''}`}
              aria-pressed={mobilePortraitPane === 'reader'}
              onClick={() => selectMobilePortraitPane('reader')}
            >
              {t('app.mobilePane.reader')}
            </button>
            <button
              type="button"
              className={`mobile-pane-switcher__button${mobilePortraitPane === 'right' ? ' is-active' : ''}`}
              aria-pressed={mobilePortraitPane === 'right'}
              onClick={() => selectMobilePortraitPane('right')}
            >
              {t('app.mobilePane.right')}
            </button>
          </div>
        </header>
      ) : null}

      {workspacePersistBanner ? (
        <section
          className={`workspace-persist-banner workspace-persist-banner--${workspacePersistBanner.kind}`}
          role={workspacePersistBanner.kind === 'error' ? 'alert' : 'status'}
          aria-live={workspacePersistBanner.kind === 'error' ? 'assertive' : 'polite'}
        >
          <div className="workspace-persist-banner__copy">
            <strong>{workspacePersistBanner.title}</strong>
            <span>{workspacePersistBanner.body}</span>
            {workspacePersistBanner.detail ? (
              <span className="workspace-persist-banner__detail">{workspacePersistBanner.detail}</span>
            ) : null}
          </div>
          <div className="workspace-persist-banner__actions">
            {workspacePersistBanner.canRetry ? (
              <button
                type="button"
                className="ghost-button small"
                onClick={() => scheduleWorkspacePersist({ immediate: true })}
              >
                {t('app.workspacePersist.retry')}
              </button>
            ) : null}
            <button
              type="button"
              className="ghost-button small"
              onClick={() => void loadWorkspace({ reason: 'manual' })}
            >
              {t('shared.action.reload')}
            </button>
          </div>
        </section>
      ) : null}

      {/*
        <div className="demo-banner warning-banner">
          <strong>仓库回退</strong>
          <span>{repositoryBinding.issue}</span>
        </div>
      */}

      {/*
        <div className="demo-banner">
          <strong>演示模式</strong>
          <span>
            当前左栏目录、中心阅读内容和右栏问答都来自内置微积分样例仓库。要切换到真实仓库，请在设置中选择 Obsidian 目录并挂载。
          </span>
        </div>
      */}

      <div ref={workspaceRef} className="workspace-grid" style={layoutMetrics?.style}>
        <section
          className={`workspace-pane canvas-layer${rightPaneMobileClass}`}
          onPointerEnter={() => setActiveFontPane('widget')}
          onPointerDown={() => setActiveFontPane('widget')}
          onWheelCapture={(event) => handlePaneFontWheel('widget', event)}
        >
          <Suspense fallback={null}>
            <CanvasPane
              canvas={canvas}
              qaRecords={activeRecords}
              config={config}
              documents={documents}
              mountedVaultPath={mountedVaultPath}
              remoteLibraryId={remoteLibraryId}
              remoteRevisionId={remoteRevisionId}
              onCanvasChange={(nextCanvas) => {
                setCanvas((previous) => {
                  const resolved =
                    typeof nextCanvas === 'function'
                      ? (nextCanvas as (draft: CanvasState | null) => CanvasState | null)(previous)
                      : nextCanvas
                  const normalized = resolved ? normalizeCanvasState(resolved) : resolved
                  canvasRef.current = normalized
                  return normalized
                })
              }}
              onWidgetFocus={focusWidget}
              onWidgetChange={updateWidget}
              onWidgetClose={closeWidget}
              onAsk={openAskMenu}
              onOpenContext={(widgetId) =>
                setContextModalTarget({
                  kind: 'ask-widget',
                  widgetId
                })
              }
              onSubmitCustom={submitCustomAsk}
              onOpenRecord={openRecordWidget}
              onOpenGroup={(recordIds, point) => setGroupChooser({ point, recordIds })}
              onDeleteRecord={removeRecord}
              onOpenDocument={openDocument}
              onViewportSizeChange={setCanvasViewportSize}
            />
          </Suspense>
        </section>

        {!isMobilePortraitLayout && isLeftPaneCollapsed ? (
          <CollapsedRail
            ariaLabel={t('app.a11y.expandLeftSidebar')}
            onClick={() => setLeftSidebarCollapsed(false)}
          />
        ) : (
          <aside className={`workspace-pane sidebar left-pane${leftPaneMobileClass}`}>
            <div className="panel-header">
              <div className="panel-heading">
                <strong>十二问 AnyReader</strong>
              </div>
              <div className="panel-actions">
                <button
                  type="button"
                  className="panel-action-button"
                  aria-label={t('app.a11y.collapseLeftSidebar')}
                  onClick={() => setLeftSidebarCollapsed(true)}
                >
                  <span aria-hidden="true">−</span>
                </button>
              </div>
            </div>
            <SidebarTree
              repo={repo}
              nodes={sidebarNodes}
              documents={documents}
              collapsedFolderIds={normalizedCollapsedSidebarFolderIds}
              currentDocumentId={currentDocument.id}
              onOpenDocument={openDocument}
              onToggleFolder={toggleSidebarFolder}
              onAsk={openAskMenu}
            />
            <div className="sidebar-controls">
              <div className="model-menu-wrap" ref={modelMenuRef}>
                <button
                  type="button"
                  className="model-menu-trigger"
                  aria-expanded={modelMenuOpen}
                  onClick={() => {
                    setModelMenuOpen((open) => !open)
                    setSettingsMenuOpen(false)
                  }}
                >
                  <span className="topbar-credit-icon" aria-hidden="true">
                    <FourPointStarIcon />
                  </span>
                  <span className="model-menu-trigger__main">{topbarCreditSummary}</span>
                </button>
                {modelMenuOpen ? (
                  <div className="model-menu" role="menu">
                    <span className="model-menu-heading">{t('app.header.model')}</span>
                    {llmAccess?.models.length ? (
                      llmAccess.models.map((model) => (
                        <button
                          key={model.id}
                          type="button"
                          role="menuitemradio"
                          aria-checked={model.id === topbarModelValue}
                          className={`model-menu-item${model.id === topbarModelValue ? ' is-active' : ''}`}
                          onClick={() => {
                            setModelMenuOpen(false)
                            updateConfig((draft) => ({
                              ...draft,
                              provider: {
                                ...draft.provider,
                                model: model.id
                              }
                            }))
                          }}
                        >
                          <span>{formatLlmModelDisplayName(model.displayName, model.model)}</span>
                          <small>{model.cost}</small>
                        </button>
                      ))
                    ) : (
                      <span className="model-menu-empty">{t('app.header.modelUnavailable')}</span>
                    )}
                    <a className="model-menu-subscription" role="menuitem" href={subscriptionPath}>
                      {t('app.header.manageSubscription')}
                    </a>
                  </div>
                ) : null}
              </div>
              <div className="settings-menu-wrap" ref={settingsMenuRef}>
                <button
                  type="button"
                  className="ghost-button settings-menu-trigger"
                  aria-expanded={settingsMenuOpen}
                  onClick={() => {
                    setSettingsMenuOpen((open) => !open)
                    setModelMenuOpen(false)
                  }}
                >
                  {t('app.header.settings')}
                </button>
                {settingsMenuOpen ? (
                  <div className="settings-menu" role="menu">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSettingsMenuOpen(false)
                        setModal('templates')
                      }}
                    >
                      {t('app.header.templates')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSettingsMenuOpen(false)
                        openContextSettings()
                      }}
                    >
                      {t('app.header.context')}
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setSettingsMenuOpen(false)
                        setModal('settings')
                      }}
                  >
                    {t('chrome.workspaceSettings.title')}
                  </button>
                  </div>
                ) : null}
              </div>
            </div>
          </aside>
        )}

        {!isMobilePortraitLayout ? (
          <button
            type="button"
            className={`pane-resizer left${isLeftPaneCollapsed ? ' hidden' : ''}`}
            onPointerDown={(event) => beginSidebarResize('left', event)}
            tabIndex={isLeftPaneCollapsed ? -1 : 0}
            aria-hidden={isLeftPaneCollapsed}
            aria-label={t('app.a11y.resizeLeftSidebar')}
          />
        ) : null}

        {!isMobilePortraitLayout && isRightPaneCollapsed ? (
          <CollapsedRail
            side="left"
            ariaLabel={t('app.mobilePane.reader')}
            onClick={() => setRightSidebarCollapsed(false)}
          />
        ) : (
          <main
            className={`workspace-pane reader-pane${readerPaneMobileClass}${isReaderFullscreen ? ' is-fullscreen' : ''}`}
            onPointerEnter={() => setActiveFontPane('reader')}
            onPointerDown={() => setActiveFontPane('reader')}
            onWheelCapture={(event) => handlePaneFontWheel('reader', event)}
          >
            <div className="panel-header reader-panel-header">
              <div className="panel-heading" aria-hidden="true" />
              <div className="panel-actions">
                <button
                  type="button"
                  className="panel-action-button"
                  aria-label={t('app.a11y.collapseReaderPane')}
                  onClick={() => {
                    setIsReaderFullscreen(false)
                    setRightSidebarCollapsed(true)
                  }}
                >
                  <span aria-hidden="true">−</span>
                </button>
                <button
                  type="button"
                  className="panel-action-button"
                  aria-label={isReaderFullscreen ? t('app.a11y.exitReaderFullscreen') : t('app.a11y.enterReaderFullscreen')}
                  aria-pressed={isReaderFullscreen}
                  onClick={() => setIsReaderFullscreen((fullscreen) => !fullscreen)}
                >
                  <span aria-hidden="true">{isReaderFullscreen ? '□' : '▢'}</span>
                </button>
              </div>
            </div>
            <div className="reader-scroll" ref={readerScrollRef} onScroll={handleReaderScroll}>
              {shouldRenderReaderTitle ? (
                <header className="reader-article-header">
                  <h1 className="reader-article-title">{currentDocument.title.trim()}</h1>
                </header>
              ) : null}
              <Suspense fallback={null}>
                <MarkdownSurface
                  markdown={currentDocument.contentMd}
                  qaRecords={activeRecords}
                  config={config}
                  surface="reader"
                  documentId={currentDocument.id}
                  documentPath={currentDocument.path}
                  documents={documents}
                  mountedVaultPath={mountedVaultPath}
                  remoteLibraryId={remoteLibraryId}
                  remoteRevisionId={remoteRevisionId}
                  surfaceTitle={currentDocument.title}
                  onAsk={openAskMenu}
                  onOpenRecord={openRecordWidget}
                  onOpenGroup={(recordIds, point) => setGroupChooser({ point, recordIds })}
                  onOpenDocument={openDocument}
                />
              </Suspense>
            </div>
          </main>
        )}

        {!isMobilePortraitLayout ? (
          <button
            type="button"
            className={`pane-resizer right${isRightPaneCollapsed ? ' hidden' : ''}`}
            onPointerDown={(event) => beginSidebarResize('right', event)}
            tabIndex={isRightPaneCollapsed ? -1 : 0}
            aria-hidden={isRightPaneCollapsed}
            aria-label={t('app.a11y.resizeRightSidebar')}
          />
        ) : null}
      </div>

      {askMenu ? (
        <AskMenu
          askMenu={askMenu}
          templates={sortedTemplates}
          onHoverTemplate={(templateId) =>
            setAskMenu((previous) => (previous ? { ...previous, hoveredTemplateId: templateId } : previous))
          }
          onSelectTemplate={handleTemplateAsk}
          onCustomAsk={handleCustomAsk}
          showQuickErrata={
            Boolean(
              isRemoteRepo &&
                remoteLibraryId &&
                remoteRevisionId &&
                askMenu.session.action.surface === 'reader' &&
                askMenu.session.action.target.documentId
            )
          }
          onQuickErrata={openQuickErrataFromAskMenu}
          onClose={() => setAskMenu(null)}
          onOpenTemplates={() => {
            setAskMenu(null)
            setModal('templates')
          }}
        />
      ) : null}

      {groupChooser ? (
        <GroupChooser
          point={groupChooser.point}
          records={groupChooser.recordIds
            .map((recordId) => activeRecords.find((record) => record.id === recordId) ?? null)
            .filter((record): record is QARecord => Boolean(record))}
          templates={config.templates}
          onOpenRecord={(recordId) => {
            openRecordWidget(recordId)
            setGroupChooser(null)
          }}
          onClose={() => setGroupChooser(null)}
        />
      ) : null}

      {modal === 'templates' ? (
        <TemplateSettingsModal
          templates={config.templates}
          onClose={() => setModal(null)}
          onChange={(templates) =>
            updateConfig((draft) => ({
              ...draft,
              templates
            }))
          }
        />
      ) : null}

      {contextModalState ? (
        <ContextSettingsModal
          title={contextModalState.title}
          note={contextModalState.note}
          currentMode={contextModalState.currentMode}
          allowedModes={contextModalState.allowedModes}
          viewportRangeBlocks={contextModalState.viewportRangeBlocks}
          learningPrompt={contextModalState.learningPrompt}
          selectedText={contextModalState.selectedText}
          previewText={contextModalState.previewText}
          onClose={() => setContextModalTarget(null)}
          onChangeMode={(mode) => {
            if (!config) {
              return
            }

            if (contextModalTarget?.kind === 'next-ask') {
              setNextAskContextMode(mode === config.context.defaultMode ? null : mode)
              return
            }

            if (contextModalTarget?.kind === 'ask-menu') {
              updateAskMenuContextMode(mode)
              return
            }

            if (contextModalTarget?.kind === 'ask-widget') {
              updateCustomAskWidgetContextMode(contextModalTarget.widgetId, mode)
            }
          }}
          onChangeLearningPrompt={(learningPrompt) => {
            if (contextModalTarget?.kind === 'next-ask') {
              updateConfig((draft) => ({
                ...draft,
                learning: {
                  ...draft.learning,
                  prompt: learningPrompt
                }
              }))
              return
            }

            if (contextModalTarget?.kind === 'ask-menu') {
              updateAskMenuLearningPrompt(learningPrompt)
              return
            }

            if (contextModalTarget?.kind === 'ask-widget') {
              updateCustomAskWidgetLearningPrompt(contextModalTarget.widgetId, learningPrompt)
            }
          }}
          onChangeViewportRangeBlocks={(viewportRangeBlocks) =>
            updateConfig((draft) => ({
              ...draft,
              context: {
                ...draft.context,
                viewportRangeBlocks
              }
            }))
          }
        />
      ) : null}

      {modal === 'settings' ? (
        <GlobalSettingsModal
          repositoryBinding={repositoryBinding}
          onClose={() => setModal(null)}
          onReloadWorkspace={() => loadWorkspace({ reason: 'manual' })}
        />
      ) : null}

      {quickErrataOpen && quickErrataTarget ? (
        <QuickErrataModal
          documentTitle={quickErrataTarget.documentTitle}
          documentPath={quickErrataTarget.documentPath}
          librariesHref={`${librariesPath}#open-tickets`}
          draft={quickErrataDraft}
          isSubmitting={quickErrataSubmitting}
          isSubmitted={quickErrataSubmitted}
          errorMessage={quickErrataError}
          onClose={() => {
            setQuickErrataOpen(false)
            setQuickErrataTarget(null)
            setQuickErrataError(null)
            setQuickErrataSubmitted(false)
          }}
          onChange={updateQuickErrataDraft}
          onSubmit={() => void submitQuickErrata()}
        />
      ) : null}
    </div>
  )
}
