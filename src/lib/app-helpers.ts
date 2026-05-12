import { clamp, createId, hashString, makeSummary, truncateText } from './text'
import { getMathAnchorLatex, getMathDisplayText, getMathPromptText } from './math-selection'
import type {
  AppConfig,
  AnchorTarget,
  AskAction,
  AskContextPreview,
  CanvasState,
  CanvasViewportSize,
  DocumentNode,
  PendingAskSession,
  PromptIntent,
  PromptTemplate,
  QARecord,
  ReadingContextMode,
  WidgetState
} from '../types/domain'
import type { RepoMeta } from '../types/domain'

const READER_CONTEXT_MODES: ReadingContextMode[] = [
  'paragraph',
  'section',
  'directory',
  'viewport-range',
  'manual-selection'
]
const WIDGET_CONTEXT_MODES: ReadingContextMode[] = ['widget-local']
const SIDEBAR_CONTEXT_MODES: ReadingContextMode[] = ['sidebar-node']

type SelectionLike = AskAction['selection'] & {
  mathAnchorLatex?: string
  mathDisplayText?: string
  mathPromptText?: string
}

export const MIN_WIDGET_WIDTH = 260
export const MIN_WIDGET_HEIGHT = 220
export const DEFAULT_WIDGET_WIDTH = 480
export const DEFAULT_WIDGET_HEIGHT = 600
export const MAX_LEFT_SIDEBAR_WIDTH = 520
export const MAX_RIGHT_SIDEBAR_WIDTH = 1600
export const WORKSPACE_SPLITTER_WIDTH = 12
export const CURRENT_SELECTOR_VERSION = 'tiptap-mathlive-v1'
export const MIN_CANVAS_ZOOM = 0.6
export const MAX_CANVAS_ZOOM = 1.7

const CANVAS_WIDGET_PADDING = 28
const DEFAULT_CANVAS_HEIGHT = 640

function getSelectionDisplayText(selection: SelectionLike) {
  return selection.kind === 'math' ? getMathDisplayText(selection) || selection.text : selection.text
}

function getSelectionPromptText(selection: SelectionLike) {
  return selection.kind === 'math' ? getMathPromptText(selection) || getSelectionDisplayText(selection) : selection.text
}

export function sortTemplates(templates: PromptTemplate[]) {
  return [...templates].sort((left, right) => left.order - right.order)
}

export function buildDocumentContextBlock(document: DocumentNode, mode: 'summary' | 'full' = 'full') {
  const content =
    mode === 'summary'
      ? document.isContentLoaded
        ? makeSummary(document.contentMd, 180)
        : ''
      : document.isContentLoaded
        ? document.contentPlainText
        : ''

  return content ? `# ${document.title}\n${content}` : `# ${document.title}`
}

export function upsertQaRecord(records: QARecord[], record: QARecord) {
  const existingIndex = records.findIndex((candidate) => candidate.id === record.id)
  if (existingIndex < 0) {
    return [...records, record]
  }
  const next = [...records]
  next[existingIndex] = record
  return next
}

export function clampWidgetSize(size: { w: number; h: number }) {
  return {
    w: Math.max(MIN_WIDGET_WIDTH, Math.round(size.w || DEFAULT_WIDGET_WIDTH)),
    h: Math.max(MIN_WIDGET_HEIGHT, Math.round(size.h || DEFAULT_WIDGET_HEIGHT))
  }
}

export function estimateCanvasViewportSize(
  layout: AppConfig['layout'],
  fallback?: Partial<CanvasViewportSize> | null
): CanvasViewportSize {
  const fallbackWidth = fallback?.width && fallback.width > 0 ? fallback.width : undefined
  const fallbackHeight = fallback?.height && fallback.height > 0 ? fallback.height : undefined

  return {
    width: fallbackWidth ?? Math.max(280, layout.rightSidebarWidth - 24),
    height:
      fallbackHeight ??
      Math.max(360, (typeof window === 'undefined' ? DEFAULT_CANVAS_HEIGHT : window.innerHeight - 230))
  }
}

export function normalizeCanvasViewport(viewport: CanvasState['viewport']): CanvasState['viewport'] {
  return {
    x: Number.isFinite(viewport.x) ? viewport.x : 0,
    y: Number.isFinite(viewport.y) ? viewport.y : 0,
    zoom: clamp(Number.isFinite(viewport.zoom) ? viewport.zoom : 1, MIN_CANVAS_ZOOM, MAX_CANVAS_ZOOM)
  }
}

export function computeVisibleCanvasRect(canvas: CanvasState, viewportSize: CanvasViewportSize) {
  const viewport = normalizeCanvasViewport(canvas.viewport)
  const zoom = viewport.zoom
  return {
    left: -viewport.x / zoom,
    top: -viewport.y / zoom,
    width: Math.max(1, viewportSize.width / zoom),
    height: Math.max(1, viewportSize.height / zoom)
  }
}

export function clampWidgetPositionToVisibleRect(
  position: { x: number; y: number },
  size: { w: number; h: number },
  visibleRect: { left: number; top: number; width: number; height: number },
  padding = CANVAS_WIDGET_PADDING
) {
  const availableWidth = Math.max(0, visibleRect.width - padding * 2)
  const availableHeight = Math.max(0, visibleRect.height - padding * 2)
  const nextX =
    size.w >= availableWidth
      ? visibleRect.left + padding
      : clamp(position.x, visibleRect.left + padding, visibleRect.left + visibleRect.width - size.w - padding)
  const nextY =
    size.h >= availableHeight
      ? visibleRect.top + padding
      : clamp(position.y, visibleRect.top + padding, visibleRect.top + visibleRect.height - size.h - padding)

  return {
    x: Math.round(nextX),
    y: Math.round(nextY)
  }
}

function canPlaceWidgetAtPosition(
  position: { x: number; y: number },
  size: { w: number; h: number },
  visibleRect: { left: number; top: number; width: number; height: number },
  padding = CANVAS_WIDGET_PADDING
) {
  return (
    position.x >= visibleRect.left + padding &&
    position.y >= visibleRect.top + padding &&
    position.x + size.w <= visibleRect.left + visibleRect.width - padding &&
    position.y + size.h <= visibleRect.top + visibleRect.height - padding
  )
}

export function ensureWidgetVisible(
  canvas: CanvasState,
  widget: WidgetState,
  viewportSize: CanvasViewportSize
): WidgetState {
  const size = clampWidgetSize(widget.size)
  const visibleRect = computeVisibleCanvasRect(canvas, viewportSize)

  return {
    ...widget,
    size,
    position: clampWidgetPositionToVisibleRect(widget.position, size, visibleRect)
  }
}

export function frameWidgetInCanvasViewport(
  canvas: CanvasState,
  widget: WidgetState,
  viewportSize: CanvasViewportSize,
  padding = CANVAS_WIDGET_PADDING
) {
  const viewport = normalizeCanvasViewport(canvas.viewport)
  const size = clampWidgetSize(widget.size)
  const availableWidth = Math.max(1, viewportSize.width - padding * 2)
  const availableHeight = Math.max(1, viewportSize.height - padding * 2)
  const screenWidth = size.w * viewport.zoom
  const screenHeight = size.h * viewport.zoom
  const minX = padding - widget.position.x * viewport.zoom
  const maxX = viewportSize.width - padding - screenWidth - widget.position.x * viewport.zoom
  const minY = padding - widget.position.y * viewport.zoom
  const maxY = viewportSize.height - padding - screenHeight - widget.position.y * viewport.zoom

  return {
    ...viewport,
    x: screenWidth >= availableWidth ? minX : clamp(viewport.x, minX, maxX),
    y: screenHeight >= availableHeight ? minY : clamp(viewport.y, minY, maxY)
  }
}

export function nextWidgetFrame(canvas: CanvasState, viewportSize: CanvasViewportSize) {
  const nextZIndex = Math.max(0, ...canvas.widgetStates.map((widget) => widget.zIndex)) + 1
  const offset = canvas.widgetStates.length % 8
  const size = clampWidgetSize({
    w: DEFAULT_WIDGET_WIDTH,
    h: DEFAULT_WIDGET_HEIGHT
  })
  const visibleRect = computeVisibleCanvasRect(canvas, viewportSize)
  const selectedWidget = canvas.selection?.widgetId
    ? canvas.widgetStates.find((widget) => widget.id === canvas.selection?.widgetId) ?? null
    : null
  const selectedWidgetSize = selectedWidget ? clampWidgetSize(selectedWidget.size) : null
  const preferredGap = 24
  const contextualPosition =
    selectedWidget && selectedWidgetSize
      ? [
          {
            x: selectedWidget.position.x + preferredGap,
            y: selectedWidget.position.y + selectedWidgetSize.h + preferredGap
          },
          {
            x: selectedWidget.position.x + preferredGap,
            y: selectedWidget.position.y - size.h - preferredGap
          },
          {
            x: selectedWidget.position.x + selectedWidgetSize.w + preferredGap,
            y: selectedWidget.position.y + preferredGap
          },
          {
            x: selectedWidget.position.x - size.w - preferredGap,
            y: selectedWidget.position.y + preferredGap
          }
        ].find((position) => canPlaceWidgetAtPosition(position, size, visibleRect)) ?? null
      : null
  const proposedPosition = contextualPosition ?? {
    x: visibleRect.left + visibleRect.width * 0.5 - size.w / 2 + offset * 18,
    y: visibleRect.top + visibleRect.height * 0.45 - size.h / 2 + offset * 16
  }

  return {
    id: createId('widget'),
    position: clampWidgetPositionToVisibleRect(proposedPosition, size, visibleRect),
    size,
    zIndex: nextZIndex,
    isCollapsed: false
  }
}

export function buildPendingAskSession(action: AskAction): PendingAskSession {
  return {
    id: createId('ask-session'),
    action,
    createdAt: new Date().toISOString()
  }
}

export function allowedContextModesForSurface(surface: AskAction['surface']): ReadingContextMode[] {
  switch (surface) {
    case 'reader':
      return [...READER_CONTEXT_MODES]
    case 'widget':
      return [...WIDGET_CONTEXT_MODES]
    case 'sidebar':
      return [...SIDEBAR_CONTEXT_MODES]
  }
}

export function allowedContextModesForNextAsk(): ReadingContextMode[] {
  return [...READER_CONTEXT_MODES]
}

export function resolveContextMode(
  action: AskAction,
  config: AppConfig,
  requestedMode: ReadingContextMode | null | undefined = action.contextMode
): ReadingContextMode {
  const allowedModes = allowedContextModesForSurface(action.surface)
  if (requestedMode && allowedModes.includes(requestedMode)) {
    return requestedMode
  }

  if (action.surface === 'widget') {
    return config.context.widgetDefaultMode
  }
  if (action.surface === 'sidebar') {
    return 'sidebar-node'
  }
  return config.context.defaultMode
}

export function createPendingRecord(args: {
  action: AskAction
  config: AppConfig
  repo: RepoMeta
  documents: DocumentNode[]
  canvasId: string
  template: PromptTemplate | null
  sourceParentRecord: QARecord | null
}) {
  const { action, config, repo, documents, canvasId, template, sourceParentRecord } = args
  const selectedText = getSelectionDisplayText(action.selection)
  const promptSelectionText = getSelectionPromptText(action.selection)
  const createdAt = new Date().toISOString()
  const resolved = resolveAskContext({
    action,
    config,
    repo,
    documents
  })
  const questionText = action.customPrompt ?? template?.body ?? ''

  return {
    id: createId('qa'),
    sourceSurface: action.surface,
    sourceDocumentId: action.target.documentId,
    sourceWidgetId: action.target.widgetId,
    sourceSidebarNodeId: action.target.sidebarNodeId,
    anchor: buildAnchor(action, repo.id, canvasId),
    parentQaRecordId: sourceParentRecord?.id,
    rootQaRecordId: sourceParentRecord?.rootQaRecordId ?? sourceParentRecord?.id,
    selectedText,
    selectedTextKind: action.selection.kind ?? (action.surface === 'sidebar' ? 'node-label' : 'plain'),
    promptTemplateId: template?.id,
    promptIntent: inferPromptIntent(template, action.customPrompt),
    customPromptTitle: action.customPrompt ? '自定义提问' : undefined,
    customPromptBody: action.customPrompt,
    systemStatePrompt: resolved.systemStatePrompt,
    readingContextMode: resolved.readingContextMode,
    readingContextSnapshot: resolved.readingContextSnapshot,
    fullPrompt: buildFullPrompt({
      systemStatePrompt: resolved.systemStatePrompt,
      contextMode: resolved.readingContextMode,
      contextSnapshot: resolved.readingContextSnapshot,
      questionText,
      selectedText,
      promptSelectionText: promptSelectionText !== selectedText ? promptSelectionText : undefined
    }),
    questionText,
    answerMarkdown: '',
    answerStatus: questionText ? 'pending' : 'aborted',
    timing: {
      requestedAt: createdAt
    },
    visualStyle: {
      color: template?.color ?? '#5f4b32',
      markerType: action.selection.preferredMarkerType ?? 'underline'
    },
    lifecycle: {
      isDeleted: false
    },
    createdAt,
    updatedAt: createdAt
  } satisfies QARecord
}

export function buildContextPreview(args: {
  action: AskAction
  config: AppConfig
  repo: RepoMeta
  documents: DocumentNode[]
}): AskContextPreview {
  const resolved = resolveAskContext(args)

  return {
    statePrompt: resolved.systemStatePrompt,
    readingContext: resolved.readingContextSnapshot,
    readingContextMode: resolved.readingContextMode,
    selectedText: getSelectionDisplayText(args.action.selection)
  }
}

function resolveAskContext(args: {
  action: AskAction
  config: AppConfig
  repo: RepoMeta
  documents: DocumentNode[]
}) {
  const { action, config, repo, documents } = args
  const learningPrompt = action.learningPrompt ?? config.learning.prompt
  const readingContextMode = resolveContextMode(action, config)
  const systemStatePrompt = [
    '你是 AnyReader 的阅读助理。',
    learningPrompt
  ]
    .filter(Boolean)
    .join('\n')

  return {
    systemStatePrompt,
    readingContextMode,
    readingContextSnapshot: buildContextSnapshot({
      action,
      contextMode: readingContextMode,
      repo,
      documents,
      config
    })
  }
}

export function buildFullPrompt(args: {
  systemStatePrompt: string
  contextMode: ReadingContextMode
  contextSnapshot: string
  questionText: string
  selectedText: string
  promptSelectionText?: string
}) {
  return [
    '状态提示词：',
    args.systemStatePrompt,
    '',
    `阅读视野上下文（${labelForContextMode(args.contextMode)}）：`,
    args.contextSnapshot,
    '',
    '提问：',
    args.questionText || '请根据选中文本回答用户的自定义问题。',
    '',
    '被选中的文本：',
    args.selectedText,
    ...(args.promptSelectionText ? ['', 'Selected math (LaTeX):', args.promptSelectionText] : [])
  ].join('\n')
}

export function buildContextSnapshot(args: {
  action: AskAction
  contextMode: ReadingContextMode
  repo: RepoMeta
  documents: DocumentNode[]
  config: AppConfig
}) {
  const { action, contextMode, documents, config } = args
  const documentMap = new Map(documents.map((document) => [document.id, document]))
  const document = action.target.documentId ? documentMap.get(action.target.documentId) ?? null : null
  const selectedText = getSelectionDisplayText(action.selection)
  const mathDisplayText = action.selection.kind === 'math' ? getMathDisplayText(action.selection) : ''

  if (action.surface === 'widget') {
    const widgetContextFromSelection = [action.selection.contextPrefix, selectedText, action.selection.contextSuffix].join('')
    const widgetContext = action.selection.surfaceText ?? widgetContextFromSelection
    if (mathDisplayText) {
      return truncateText([`Selected math: ${mathDisplayText}`, '', widgetContext].join('\n'), 1400)
    }
    return truncateText(widgetContext, 1400)
  }

  if (action.surface === 'sidebar') {
    if (action.target.sidebarNodeType === 'repo') {
      return truncateText(documents.map((item) => buildDocumentContextBlock(item, 'summary')).join('\n\n'), 1200)
    }

    const sidebarDocument = action.target.sidebarNodeId ? documentMap.get(action.target.sidebarNodeId) ?? null : null
    return truncateText(
      sidebarDocument?.contentPlainText ?? action.selection.surfaceText ?? selectedText,
      1200
    )
  }

  const content = document?.contentPlainText ?? action.selection.surfaceText ?? selectedText
  const start = action.selection.startOffset ?? 0
  const end = action.selection.endOffset ?? Math.min(content.length, start + selectedText.length)
  const sliceAround = (radius: number) =>
    truncateText(content.slice(clamp(start - radius, 0, content.length), clamp(end + radius, 0, content.length)), 1200)

  const mathSelectionSummary = mathDisplayText
    ? [`Selected math: ${mathDisplayText}`, '', sliceAround(220)].join('\n')
    : null

  if (contextMode === 'paragraph') {
    return mathSelectionSummary ?? sliceAround(220)
  }

  if (contextMode === 'section') {
    return mathSelectionSummary ?? truncateText(content, 1800)
  }

  if (contextMode === 'directory') {
    const siblings = documents
      .filter((candidate) => candidate.parentId === document?.parentId)
      .sort((left, right) => left.order - right.order)
    return truncateText(siblings.map((candidate) => buildDocumentContextBlock(candidate)).join('\n\n'), 1800)
  }

  if (contextMode === 'viewport-range') {
    return mathSelectionSummary ?? sliceAround(Math.max(1, config.context.viewportRangeBlocks) * 260)
  }

  if (contextMode === 'manual-selection') {
    return truncateText(mathDisplayText || selectedText, 800)
  }

  return truncateText(content, 1800)
}

export function buildAnchor(action: AskAction, repoId: string, canvasId: string) {
  const target =
    action.surface === 'reader'
      ? {
          surface: 'reader' as const,
          documentId: action.target.documentId ?? 'unknown-document'
        }
      : action.surface === 'widget'
        ? {
            surface: 'widget' as const,
            canvasId,
            widgetId: action.target.widgetId ?? 'unknown-widget',
            sourceQaRecordId: action.sourceQaRecordId,
            widgetContentPath: action.selection.widgetContentPath
          }
        : {
            surface: 'sidebar' as const,
            repoId,
            nodeId: action.target.sidebarNodeId ?? repoId,
            nodeType: action.target.sidebarNodeType ?? 'document'
          }

  const selectedText = getSelectionDisplayText(action.selection)
  const quoteHash = hashString(selectedText)
  const mathAnchorLatex = getMathAnchorLatex(action.selection)
  const mathDisplayText = action.selection.kind === 'math' ? getMathDisplayText(action.selection) : ''
  const mathPromptText = action.selection.kind === 'math' ? getMathPromptText(action.selection) : ''

  return {
    id: createId('anchor'),
    target,
    quote: action.selection.anchorQuote,
    quoteHash,
    anchorFrom: action.selection.anchorFrom,
    anchorTo: action.selection.anchorTo,
    startOffset: action.selection.startOffset,
    endOffset: action.selection.endOffset,
    startPath: action.selection.startPath,
    endPath: action.selection.endPath,
    mathNodeId: action.selection.mathNodeId,
    mathMode: action.selection.mathMode,
    mathSelectionLatex: (action.selection.mathSelectionLatex ?? mathAnchorLatex) || undefined,
    mathAnchorLatex: mathAnchorLatex || undefined,
    mathDisplayText: mathDisplayText || undefined,
    mathPromptText: mathPromptText || undefined,
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
  }
}

export function buildAnchorFingerprint(args: {
  target: AnchorTarget
  selectedText: string
  quoteHash: string
  anchorFrom?: number
  anchorTo?: number
  startOffset?: number
  endOffset?: number
  startPath?: string
  endPath?: string
  mathNodeId?: string
  mathSelectionPath?: string
}) {
  const { target, selectedText, quoteHash, anchorFrom, anchorTo, startOffset, endOffset, startPath, endPath, mathNodeId, mathSelectionPath } = args

  if (target.surface === 'sidebar') {
    return hashString(`sidebar:${target.nodeId}:${selectedText}:${quoteHash}`)
  }

  const targetKey =
    target.surface === 'reader'
      ? `${target.documentId}:${target.blockId ?? ''}`
      : `${target.canvasId}:${target.sourceQaRecordId ?? target.widgetId}:${target.widgetContentPath ?? ''}`
  if (mathNodeId && mathSelectionPath) {
    return hashString(`${target.surface}:${targetKey}:math:${mathNodeId}:${mathSelectionPath}:${quoteHash}`)
  }
  const selectorKey =
    anchorFrom !== undefined && anchorTo !== undefined
      ? `pm:${anchorFrom}:${anchorTo}`
      : `${startPath ?? `offset:${startOffset ?? ''}`}:${endPath ?? `offset:${endOffset ?? ''}`}`
  return hashString(`${target.surface}:${targetKey}:${selectorKey}:${quoteHash}`)
}

export function inferPromptIntent(template: PromptTemplate | null, customPrompt?: string): PromptIntent {
  if (customPrompt) {
    return 'custom'
  }

  switch (template?.id) {
    case 'template-symbol':
      return 'symbol_meaning'
    case 'template-equals':
      return 'step_justification'
    case 'template-theorem':
      return 'theorem_mapping'
    case 'template-intuition':
      return 'intuition'
    case 'template-apply':
      return 'summary'
    default:
      return 'custom'
  }
}

export function labelForContextMode(mode: ReadingContextMode) {
  switch (mode) {
    case 'paragraph':
      return '当前段落'
    case 'section':
      return '当前小节'
    case 'directory':
      return '当前目录'
    case 'viewport-range':
      return '当前屏幕附近'
    case 'manual-selection':
      return '手动选区'
    case 'widget-local':
      return '当前 Widget'
    case 'sidebar-node':
      return '左栏节点'
  }
}

export function labelForRequestState(state: 'idle' | 'editing' | 'pending' | 'streaming' | 'done' | 'error') {
  switch (state) {
    case 'idle':
      return '待机'
    case 'editing':
      return '等待输入'
    case 'pending':
      return '已发送，等待首 token'
    case 'streaming':
      return '流式回答中'
    case 'done':
      return '已完成'
    case 'error':
      return '请求失败'
  }
}

export function labelForAnswerStatus(status: QARecord['answerStatus']) {
  switch (status) {
    case 'pending':
      return '待发送'
    case 'streaming':
      return '生成中'
    case 'done':
      return '已完成'
    case 'error':
      return '失败'
    case 'aborted':
      return '草稿'
  }
}
