import type {
  AppConfig,
  CanvasState,
  DocumentCatalogEntry,
  PromptTemplate,
  RepoMeta
} from '../types/domain'
import { markdownToPlainText } from './text'

const now = () => new Date().toISOString()
const LEGACY_BUILT_IN_TEMPLATE_IDS = new Set([
  'template-symbol',
  'template-equals',
  'template-theorem',
  'template-intuition',
  'template-apply'
])

export const DEMO_REPO_ID = 'demo-calculus'
export const MAIN_CANVAS_ID = 'main'
export const LOCAL_MOUNTED_VAULT_PATH = '微积分二层次下'
export const LOCAL_DEFAULT_DOCUMENT_PATH =
  '第10章 重积分/10.2 二重积分的计算，曲面的面积/10.2.1 利用直角坐标计算二重积分.md'

export const demoDocuments: Array<{
  catalog: DocumentCatalogEntry
  markdown: string
}> = [
  {
    catalog: {
      id: 'multivariable-overview',
      repoId: DEMO_REPO_ID,
      path: '01-overview/multivariable-overview',
      title: '多元函数微分学：问题意识',
      parentId: null,
      childrenIds: ['partial-derivative', 'chain-rule'],
      order: 0,
      level: 1,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 多元函数微分学：问题意识

当一个量依赖于多个变量时，微分不再只是“斜率”，而是关于局部变化方式的描述。

## 为什么要重新组织阅读

- 读者常常被符号、定位、上下文回忆拖慢。
- 真正重要的是理解：变量之间如何耦合，公式为什么成立，定理在什么前提下工作。
- AnyReader 的目标是把这些 Dirty Work 压到系统层。

> 一段好的解释，应该把符号、对象和动作一一对齐。

设 \(z = f(x, y)\)。如果只改变 \(x\)，并把 \(y\) 固定，我们就在观察一个局部切片。
`
  },
  {
    catalog: {
      id: 'partial-derivative',
      repoId: DEMO_REPO_ID,
      path: '01-overview/partial-derivative',
      title: '偏导数：固定其余变量',
      parentId: 'multivariable-overview',
      childrenIds: [],
      order: 0,
      level: 2,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 偏导数：固定其余变量

设 \(z = f(x, y)\)。

当我们写

\`\`\`text
∂f/∂x (x0, y0)
\`\`\`

它表示在点 \((x_0, y_0)\) 处，只让 \(x\) 发生微小变化，而把 \(y\) 固定时，函数值的变化率。

## 阅读时常见追问

1. 这里为什么可以把 \(y\) 当成常量？
2. 偏导数和普通导数到底是什么关系？
3. 这个符号与几何图像中的切线、切平面有什么对应？
`
  },
  {
    catalog: {
      id: 'chain-rule',
      repoId: DEMO_REPO_ID,
      path: '01-overview/chain-rule',
      title: '链式法则：把依赖关系展开',
      parentId: 'multivariable-overview',
      childrenIds: [],
      order: 1,
      level: 2,
      contentVersion: '1',
      contentPlainText: '',
      createdAt: now(),
      updatedAt: now()
    },
    markdown: `# 链式法则：把依赖关系展开

若 \(z = f(x, y)\)，且 \(x = x(t), y = y(t)\)，那么 \(z\) 实际上也依赖于 \(t\)。

\`\`\`text
dz/dt = (∂f/∂x)(dx/dt) + (∂f/∂y)(dy/dt)
\`\`\`

这个公式不是“背下来”的对象，而是依赖关系的展开：

- \(f\) 对 \(x\) 的敏感程度
- \(x\) 随 \(t\) 的变化速度
- \(f\) 对 \(y\) 的敏感程度
- \(y\) 随 \(t\) 的变化速度

阅读时最重要的是把每个字母和它代表的对象对上。
`
  }
]

for (const document of demoDocuments) {
  document.catalog.contentPlainText = markdownToPlainText(document.markdown)
}

export const demoRepoMeta: RepoMeta = {
  id: DEMO_REPO_ID,
  title: '微积分演示仓库',
  rootDocumentIds: ['multivariable-overview'],
  currentDocumentId: 'multivariable-overview',
  sourceMode: 'demo',
  createdAt: now(),
  updatedAt: now()
}

export const defaultTemplates: PromptTemplate[] = [
  {
    id: 'template-symbol',
    title: '变量含义',
    body: '解释被选中变量或符号的含义、它在当前段落中的角色，以及如果忽略它会错过什么。',
    color: '#b84d20',
    order: 0,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-equals',
    title: '等号为什么成立',
    body: '解释这一行到下一行为什么成立。按前提、使用的定义/定理、隐含假设三个部分回答。',
    color: '#0b6e4f',
    order: 1,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-theorem',
    title: '定理映射',
    body: '把当前公式或结论与相关定理逐一对齐：条件是什么，对应了哪些字母，结论怎样落到这一步。',
    color: '#1d4ed8',
    order: 2,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-intuition',
    title: '直觉解释',
    body: '用更直观的语言重讲这段内容，优先说明对象、动作、方向和变化关系。',
    color: '#7c3aed',
    order: 3,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  },
  {
    id: 'template-apply',
    title: '怎么用',
    body: '说明这段结论在解题或理解后续内容时如何使用，并给出一个最小例子。',
    color: '#8b5e00',
    order: 4,
    isBuiltIn: true,
    isEnabled: true,
    scope: 'global'
  }
]

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
