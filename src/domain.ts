export type SurfaceType = 'reader' | 'widget' | 'sidebar'
export type RepositorySourceMode = 'demo' | 'mounted-vault' | 'remote-library'
export type StorageMode = 'local-first-files' | 'remote-api'

export type PromptIntent =
  | 'symbol_meaning'
  | 'step_justification'
  | 'theorem_mapping'
  | 'intuition'
  | 'summary'
  | 'compare'
  | 'custom'

export type ReadingContextMode =
  | 'paragraph'
  | 'section'
  | 'directory'
  | 'viewport-range'
  | 'manual-selection'
  | 'widget-local'
  | 'sidebar-node'

export type MathSelectionMode = 'inline' | 'block'

export interface RepoMeta {
  id: string
  title: string
  rootDocumentIds: string[]
  currentDocumentId: string
  sourceMode: RepositorySourceMode
  libraryId?: string
  revisionId?: string
  mountedVaultPath?: string
  createdAt: string
  updatedAt: string
}

export interface DocumentCatalogEntry {
  id: string
  repoId: string
  path: string
  title: string
  parentId: string | null
  childrenIds: string[]
  order: number
  level: number
  contentVersion: string
  contentPlainText: string
  createdAt: string
  updatedAt: string
}

export interface DocumentNode extends DocumentCatalogEntry {
  contentMd: string
  isContentLoaded: boolean
}

export interface PromptTemplate {
  id: string
  title: string
  body: string
  color: string
  order: number
  isBuiltIn: boolean
  isEnabled: boolean
  scope: 'global' | 'repo' | 'document-type'
}

export interface AppConfig {
  layout: {
    leftSidebarCollapsed: boolean
    rightSidebarCollapsed: boolean
    leftSidebarWidth: number
    rightSidebarWidth: number
    leftSidebarMinWidth: number
    rightSidebarMinWidth: number
    collapsedRailWidth: number
    rememberLayout: boolean
  }
  askMenu: {
    maxVisibleTemplates: number
  }
  navigation: {
    collapsedSidebarFolderIds: string[]
    readerScrollPositions: Record<string, number>
  }
  context: {
    defaultMode: 'paragraph' | 'section' | 'directory' | 'viewport-range'
    viewportRangeBlocks: number
    widgetDefaultMode: 'widget-local'
  }
  rendering: {
    readerFontPx: number
    widgetFontPx: number
    shortSelectionCharThreshold: number
  }
  storage: {
    mode: StorageMode
    autoSaveMs: number
  }
  shortcuts: {
    toggleLeft: string
    toggleRight: string
    openContext: string
  }
  learning: {
    prompt: string
  }
  provider: {
    baseUrl: string
    apiKey: string
    model: string
    temperature: number
  }
  repository: {
    sourceMode: RepositorySourceMode
    libraryId?: string
    revisionId?: string
    mountedVaultPath?: string
    lastOpenedDocumentPath?: string
  }
  templates: PromptTemplate[]
}

export interface SidebarNode {
  id: string
  type: 'repo' | 'folder' | 'document'
  label: string
  parentId: string | null
  childrenIds: string[]
  order: number
  path?: string
  documentId?: string
}

export interface RepositoryBinding {
  requestedSourceMode: RepositorySourceMode
  activeSourceMode: RepositorySourceMode
  libraryId?: string
  revisionId?: string
  sourceLabel?: string
  mountedVaultPath?: string
  issue?: string
}

export type AnchorTarget =
  | {
      surface: 'reader'
      documentId: string
      blockId?: string
    }
  | {
      surface: 'widget'
      canvasId: string
      widgetId: string
      sourceQaRecordId?: string
      widgetContentPath?: string
    }
  | {
      surface: 'sidebar'
      repoId: string
      nodeId: string
      nodeType: 'repo' | 'folder' | 'document'
    }

export interface EmbeddedAnchor {
  id: string
  target: AnchorTarget
  quote?: string
  quoteHash?: string
  anchorFrom?: number
  anchorTo?: number
  startOffset?: number
  endOffset?: number
  startPath?: string
  endPath?: string
  mathNodeId?: string
  mathMode?: MathSelectionMode
  mathSelectionLatex?: string
  mathAnchorLatex?: string
  mathDisplayText?: string
  mathPromptText?: string
  mathSelectionPath?: string
  mathSelectionFrom?: number
  mathSelectionTo?: number
  mathAnchorVersion?: 'mathlive-v1'
  contextPrefix?: string
  contextSuffix?: string
  isRange: boolean
  anchorFingerprint: string
  selectorVersion: string
}

export interface ModelInfo {
  provider: string
  model: string
  displayName?: string
  temperature?: number
  modelId?: string
  cost?: number
  remainingCredits?: number
  permanentBalance?: number
  dailyQuota?: number
  dailyUsed?: number
  dailyRemaining?: number
  quotaDate?: string | null
  subscription?: LlmAccessState['subscription']
}

export interface LlmModelSummary {
  id: string
  displayName: string
  model: string
  cost: number
  isDefault: boolean
}

export interface LlmAccessState {
  creditBalance: number
  permanentBalance?: number
  dailyQuota?: number
  dailyUsed?: number
  dailyRemaining?: number
  quotaDate?: string | null
  subscription?: {
    configuredTier: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
    effectiveTier: 'free' | 'vip1' | 'vip2' | 'vip3' | 'vip4'
    expiresAt: string | null
    isExpired: boolean
  }
  models: LlmModelSummary[]
}

export interface AskTarget {
  documentId?: string
  widgetId?: string
  sidebarNodeId?: string
  sidebarNodeType?: 'repo' | 'folder' | 'document'
  sidebarLabel?: string
}

export interface AskActionSelection {
  text: string
  kind?: 'plain' | 'math' | 'node-label' | 'ai-generated' | 'mixed'
  anchorFrom?: number
  anchorTo?: number
  startOffset?: number
  endOffset?: number
  startPath?: string
  endPath?: string
  mathNodeId?: string
  mathMode?: MathSelectionMode
  mathSelectionLatex?: string
  mathAnchorLatex?: string
  mathDisplayText?: string
  mathPromptText?: string
  mathSelectionPath?: string
  mathSelectionFrom?: number
  mathSelectionTo?: number
  mathAnchorVersion?: 'mathlive-v1'
  widgetContentPath?: string
  contextPrefix?: string
  contextSuffix?: string
  surfaceText?: string
  anchorQuote?: string
  preferredMarkerType?: 'underline' | 'bracket'
}

export interface AskAction {
  surface: SurfaceType
  target: AskTarget
  selection: AskActionSelection
  contextMode?: ReadingContextMode
  templateId?: string
  customPrompt?: string
  learningPrompt?: string
  surfaceTitle?: string
  sourceQaRecordId?: string
  menuPoint: { x: number; y: number }
}

export type AskSelection = AskAction

export interface PendingAskSession {
  id: string
  action: AskAction
  createdAt: string
}

export interface AskContextPreview {
  statePrompt: string
  readingContext: string
  readingContextMode: ReadingContextMode
  selectedText: string
}

export interface QARecord {
  id: string
  sourceSurface: SurfaceType
  sourceDocumentId?: string
  sourceWidgetId?: string
  sourceSidebarNodeId?: string
  anchor: EmbeddedAnchor
  parentQaRecordId?: string
  rootQaRecordId?: string
  selectedText: string
  selectedTextKind?: 'plain' | 'math' | 'node-label' | 'ai-generated' | 'mixed'
  promptTemplateId?: string
  promptIntent?: PromptIntent
  customPromptTitle?: string
  customPromptBody?: string
  systemStatePrompt: string
  readingContextMode: ReadingContextMode
  readingContextSnapshot: string
  fullPrompt: string
  questionText: string
  answerMarkdown: string
  answerStatus: 'pending' | 'streaming' | 'done' | 'error' | 'aborted'
  modelInfo?: ModelInfo
  timing: {
    requestedAt: string
    firstTokenAt?: string
    completedAt?: string
    durationMs?: number
  }
  visualStyle: {
    color: string
    markerType: 'underline' | 'bracket' | 'none'
    isMergedEntry?: boolean
  }
  lifecycle: {
    isDeleted: boolean
    deletedAt?: string
  }
  createdAt: string
  updatedAt: string
}

export interface AnchorQAIndex {
  anchorFingerprint: string
  qaRecordIds: string[]
}

export interface CanvasState {
  id: string
  viewport: {
    x: number
    y: number
    zoom: number
  }
  widgetStates: WidgetState[]
  selection?: {
    widgetId: string | null
  }
  updatedAt: string
}

export interface CanvasViewportSize {
  width: number
  height: number
}

export interface WidgetFrame {
  id: string
  position: { x: number; y: number }
  size: { w: number; h: number }
  zIndex: number
  isCollapsed: boolean
}

export interface AskWidgetProps {
  mode: 'template' | 'custom'
  linkedQaRecordId?: string
  pendingSession?: PendingAskSession
  draftPrompt?: string
  contextPreview?: AskContextPreview
  requestState: 'idle' | 'editing' | 'pending' | 'streaming' | 'done' | 'error'
}

export interface QARecordWidgetProps {
  qaRecordId: string
}

export type WidgetState =
  | (WidgetFrame & {
      type: 'ask'
      props: AskWidgetProps
    })
  | (WidgetFrame & {
      type: 'qa-record'
      props: QARecordWidgetProps
    })

export interface DirEntryPayload {
  name: string
  path: string
  isDir: boolean
}

export interface WorkspaceSnapshot {
  dataRoot: string
  repo: RepoMeta
  documents: DocumentNode[]
  sidebarNodes: SidebarNode[]
  config: AppConfig
  canvas: CanvasState
  qaRecords: QARecord[]
  qaRecordCount?: number
  workspaceVersion: number
  llmAccess?: LlmAccessState
  repositoryBinding: RepositoryBinding
}
