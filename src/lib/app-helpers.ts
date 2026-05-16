import { clamp, createId, hashString, makeSummary, truncateText } from './text'
import { getMathAnchorLatex, getMathDisplayText, getMathPromptText } from './math-selection'
import type {
  AppConfig,
  AnchorTarget,
  AskAction,
  DocumentNode,
  PendingAskSession,
  PromptIntent,
  PromptTemplate,
  QARecord,
  ReadingContextMode
} from '../domain'
import type { RepoMeta } from '../domain'
export {
  DEFAULT_WIDGET_HEIGHT,
  DEFAULT_WIDGET_WIDTH,
  clampWidgetSize,
  nextWidgetFrame,
  normalizeCanvasViewport
} from './widgetFrames'

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

export const CURRENT_SELECTOR_VERSION = 'tiptap-mathlive-v1'

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
