import type {
  AppConfig,
  CanvasState,
  PromptTemplate
} from '../domain'

const now = () => new Date().toISOString()
const LEGACY_BUILT_IN_TEMPLATE_IDS = new Set([
  'template-symbol',
  'template-equals',
  'template-theorem',
  'template-intuition',
  'template-apply'
])

export const MAIN_CANVAS_ID = 'main'
export const LOCAL_MOUNTED_VAULT_PATH = '微积分二层次下'
export const LOCAL_DEFAULT_DOCUMENT_PATH =
  '第10章 重积分/10.2 二重积分的计算，曲面的面积/10.2.1 利用直角坐标计算二重积分.md'

const DEFAULT_TEMPLATE_PRESET: PromptTemplate[] = [
  {
    id: 'template-solve',
    title: '解题',
    body: '按照例题的格式完成这道题。',
    color: '#B84D20',
    order: 0,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-variable-meaning',
    title: '变量含义',
    body: '给出这个变量的元素类型、含义、功能。',
    color: '#0B6E4F',
    order: 1,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-why',
    title: '为什么',
    body: '解释选中部分为什么是对的。',
    color: '#4A5568',
    order: 2,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  }
]

function cloneTemplate(template: PromptTemplate, order: number): PromptTemplate {
  return {
    ...template,
    order
  }
}

export function applyPromptTemplateDefaults(templates?: PromptTemplate[] | null) {
  if (!Array.isArray(templates) || templates.length === 0) {
    return DEFAULT_TEMPLATE_PRESET.map((template, index) => cloneTemplate(template, index))
  }

  const customTemplates = templates.filter((template) => !template.isBuiltIn)
  const builtInTemplates = templates.filter((template) => template.isBuiltIn)
  const builtInIds = new Set(builtInTemplates.map((template) => template.id))
  const hasCurrentPreset = DEFAULT_TEMPLATE_PRESET.every((template) => builtInIds.has(template.id))
  const shouldResetBuiltIns =
    builtInTemplates.length === 0 ||
    !hasCurrentPreset ||
    builtInTemplates.some((template) => LEGACY_BUILT_IN_TEMPLATE_IDS.has(template.id))

  if (!shouldResetBuiltIns) {
    return templates.map((template, index) => cloneTemplate(template, index))
  }

  return [
    ...DEFAULT_TEMPLATE_PRESET.map((template, index) => cloneTemplate(template, index)),
    ...customTemplates.map((template, index) => cloneTemplate(template, DEFAULT_TEMPLATE_PRESET.length + index))
  ]
}

export function defaultAppConfig(): AppConfig {
  const timestamp = now()
  return {
    layout: {
      leftSidebarCollapsed: false,
      rightSidebarCollapsed: false,
      leftSidebarWidth: 280,
      rightSidebarWidth: 420,
      leftSidebarMinWidth: 220,
      rightSidebarMinWidth: 220,
      collapsedRailWidth: 36,
      rememberLayout: true
    },
    askMenu: {
      maxVisibleTemplates: 6
    },
    navigation: {
      collapsedSidebarFolderIds: [],
      readerScrollPositions: {}
    },
    context: {
      defaultMode: 'section',
      viewportRangeBlocks: 2,
      widgetDefaultMode: 'widget-local'
    },
    rendering: {
      readerFontPx: 16,
      widgetFontPx: 16,
      shortSelectionCharThreshold: 56
    },
    storage: {
      mode: 'local-first-files',
      autoSaveMs: 450
    },
    shortcuts: {
      toggleLeft: 'f',
      toggleRight: 'v',
      openContext: 'c'
    },
    learning: {
      prompt: ''
    },
    provider: {
      baseUrl: '',
      apiKey: '',
      model: 'gpt-4.1-mini',
      temperature: 0.3
    },
    repository: {
      sourceMode: 'mounted-vault',
      libraryId: undefined,
      revisionId: undefined,
      mountedVaultPath: LOCAL_MOUNTED_VAULT_PATH,
      lastOpenedDocumentPath: LOCAL_DEFAULT_DOCUMENT_PATH
    },
    templates: applyPromptTemplateDefaults()
  }
}

export function defaultCanvasState(): CanvasState {
  return {
    id: MAIN_CANVAS_ID,
    viewport: {
      x: 0,
      y: 0,
      zoom: 1
    },
    widgetStates: [],
    selection: {
      widgetId: null
    },
    updatedAt: now()
  }
}
