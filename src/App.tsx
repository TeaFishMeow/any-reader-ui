import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

const LOCAL_API = '/__any-reader-local/'
const DEFAULT_VAULT = '微积分二层次下'
const SIDEBAR_WIDTH = 268
const RAIL_WIDTH = 36

type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'chevronDown'
  | 'maximize'
  | 'close'
  | 'trash'
  | 'settings'
  | 'book'
  | 'folder'
  | 'file'
  | 'model'
  | 'save'
  | 'keyboard'
  | 'spark'

interface DirEntry {
  name: string
  path: string
  isDir: boolean
}

interface TreeNode extends DirEntry {
  children?: TreeNode[]
}

interface PromptTemplate {
  id: string
  title: string
  body: string
  color: string
  order: number
  isEnabled?: boolean
}

interface AppConfig {
  layout?: {
    leftSidebarCollapsed?: boolean
    rememberLayout?: boolean
  }
  navigation?: {
    collapsedSidebarFolderIds?: string[]
    readerScrollPositions?: Record<string, number>
  }
  rendering?: {
    readerFontPx?: number
    widgetFontPx?: number
  }
  provider?: {
    baseUrl?: string
    model?: string
    temperature?: number
  }
  repository?: {
    mountedVaultPath?: string
    lastOpenedDocumentPath?: string
  }
  shortcuts?: Record<string, string>
  templates?: PromptTemplate[]
}

interface QaRecord {
  id: string
  sourceSurface: 'reader'
  sourceDocumentId: string
  selectedText: string
  promptTemplateId: string
  promptIntent: string
  systemStatePrompt: string
  readingContextMode: string
  readingContextSnapshot: string
  fullPrompt: string
  questionText: string
  answerMarkdown: string
  answerStatus: 'done'
  modelInfo: {
    provider: string
    model: string
    temperature: number
  }
  visualStyle: {
    color: string
    markerType: string
  }
  lifecycle: {
    isDeleted: boolean
    deletedAt?: string
  }
  createdAt: string
  updatedAt: string
}

interface QaWindowState {
  id: string
  recordId: string
  x: number
  y: number
  w: number
  h: number
  z: number
  collapsed: boolean
  record?: QaRecord
}

interface CanvasFile {
  id: string
  viewport: {
    x: number
    y: number
    zoom: number
  }
  widgetStates: Array<{
    id: string
    position: { x: number; y: number }
    size: { w: number; h: number }
    zIndex: number
    isCollapsed: boolean
    type: string
    props: { qaRecordId?: string }
  }>
  selection?: { widgetId?: string }
  updatedAt: string
}

interface AskMenuState {
  x: number
  y: number
  text: string
}

interface FloatingMenuState {
  x: number
  y: number
  kind: 'model' | 'settings'
}

function apiUrl(route: string, path = '') {
  const url = new URL(`${LOCAL_API}${route}`, window.location.origin)
  if (path) {
    url.searchParams.set('path', path)
  }
  return `${url.pathname}${url.search}`
}

async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(apiUrl('text', path))
    if (!response.ok) return fallback
    return (await response.json()) as T
  } catch {
    return fallback
  }
}

async function readText(path: string, fallback = '') {
  try {
    const response = await fetch(apiUrl('text', path))
    if (!response.ok) return fallback
    return await response.text()
  } catch {
    return fallback
  }
}

async function writeText(path: string, content: string) {
  await fetch(apiUrl('text', path), {
    method: 'PUT',
    body: content
  })
}

async function listDir(path: string) {
  const response = await fetch(apiUrl('list', path))
  if (!response.ok) return []
  return (await response.json()) as DirEntry[]
}

async function readTree(rootPath: string): Promise<TreeNode[]> {
  const entries = await listDir(rootPath)
  const visible = entries.filter((entry) => !entry.name.startsWith('.') && (entry.isDir || entry.name.endsWith('.md')))
  return Promise.all(
    visible.map(async (entry) => ({
      ...entry,
      children: entry.isDir ? await readTree(`${rootPath}/${entry.path}`) : undefined
    }))
  )
}

function id() {
  return `qa_${crypto.randomUUID()}`
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function normalizeVaultPath(config: AppConfig) {
  return config.repository?.mountedVaultPath || DEFAULT_VAULT
}

function toDocumentTitle(path: string) {
  return path.split('/').pop()?.replace(/\.md$/i, '') || '正文'
}

function stripMarkdown(markdown: string) {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[`*_>#-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function encodeVaultPath(path: string) {
  return path.split('/').map(encodeURIComponent).join('/')
}

function resolveMarkdownAsset(documentPath: string, rawAssetPath: string) {
  if (/^https?:\/\//i.test(rawAssetPath) || rawAssetPath.startsWith('/')) return rawAssetPath
  const base = documentPath.split('/').slice(0, -1)
  const parts = [...base, ...rawAssetPath.split('/')]
  const resolved: string[] = []
  parts.forEach((part) => {
    if (!part || part === '.') return
    if (part === '..') resolved.pop()
    else resolved.push(part)
  })
  return `/vault/${encodeVaultPath(resolved.join('/'))}`
}

function formatMarkdown(markdown: string, documentPath = '') {
  return markdown.split(/\n{2,}/).map((block, index) => {
    const text = block.trim()
    if (!text) return null
    const lines = text.split(/\n/)
    const imageMatch = lines[0].trim().match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/)
    if (imageMatch && documentPath) {
      return (
        <figure className="markdown-figure" key={index}>
          <img src={resolveMarkdownAsset(documentPath, imageMatch[2])} alt={imageMatch[1] || ''} />
          {lines.slice(1).join(' ').trim() ? <figcaption>{lines.slice(1).join(' ').trim()}</figcaption> : null}
        </figure>
      )
    }
    if (/^#{1,6}\s/.test(text)) {
      const level = text.match(/^#+/)?.[0].length ?? 1
      const heading = text.replace(/^#{1,6}\s*/, '')
      if (level === 1) return <h1 key={index}>{heading}</h1>
      if (level === 2) return <h2 key={index}>{heading}</h2>
      return <h3 key={index}>{heading}</h3>
    }
    if (/^\$\$[\s\S]*\$\$$/.test(text)) {
      return (
        <pre className="math-block" key={index}>
          {text.replace(/^\$\$|\$\$$/g, '')}
        </pre>
      )
    }
    if (/^[-*]\s/m.test(text)) {
      return (
        <ul key={index}>
          {text.split(/\n/).map((line, itemIndex) => (
            <li key={itemIndex}>{line.replace(/^[-*]\s*/, '')}</li>
          ))}
        </ul>
      )
    }
    return <p key={index}>{text}</p>
  })
}

function defaultConfig(): AppConfig {
  return {
    layout: { leftSidebarCollapsed: false, rememberLayout: true },
    navigation: { collapsedSidebarFolderIds: [] },
    rendering: { readerFontPx: 16, widgetFontPx: 15 },
    provider: { baseUrl: '', model: 'gpt-4.1-mini', temperature: 0.3 },
    repository: {
      mountedVaultPath: DEFAULT_VAULT,
      lastOpenedDocumentPath: '第10章 重积分/index.md'
    },
    shortcuts: {
      toggleDirectory: 'f',
      toggleReader: 'v',
      openSettings: ',',
      closeMenu: 'escape'
    },
    templates: [
      {
        id: 'template-solve',
        title: '解题',
        body: '按照例题的格式完成这道题。',
        color: '#c586c0',
        order: 0,
        isEnabled: true
      },
      {
        id: 'template-variable-meaning',
        title: '变量含义',
        body: '给出这个变量的元素类型、含义、功能。',
        color: '#4ec9b0',
        order: 1,
        isEnabled: true
      },
      {
        id: 'template-why',
        title: '为什么',
        body: '解释选中部分为什么是对的。',
        color: '#dcdcaa',
        order: 2,
        isEnabled: true
      }
    ]
  }
}

function defaultCanvas(): CanvasFile {
  return {
    id: 'main',
    viewport: { x: 0, y: 0, zoom: 1 },
    widgetStates: [],
    updatedAt: new Date().toISOString()
  }
}

function Icon({ name }: { name: IconName }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeLinecap: 'square' as const, strokeWidth: 1.7 }
  if (name === 'chevronLeft') return <svg viewBox="0 0 16 16"><path {...common} d="M10 3 5 8l5 5" /></svg>
  if (name === 'chevronRight') return <svg viewBox="0 0 16 16"><path {...common} d="m6 3 5 5-5 5" /></svg>
  if (name === 'chevronUp') return <svg viewBox="0 0 16 16"><path {...common} d="m3 10 5-5 5 5" /></svg>
  if (name === 'chevronDown') return <svg viewBox="0 0 16 16"><path {...common} d="m3 6 5 5 5-5" /></svg>
  if (name === 'maximize') return <svg viewBox="0 0 16 16"><path {...common} d="M4 4h8v8H4z" /></svg>
  if (name === 'close') return <svg viewBox="0 0 16 16"><path {...common} d="m4 4 8 8M12 4l-8 8" /></svg>
  if (name === 'trash') return <svg viewBox="0 0 16 16"><path {...common} d="M3 5h10M6 5V3h4v2M5 7v6h6V7" /></svg>
  if (name === 'settings') return <svg viewBox="0 0 16 16"><path {...common} d="M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5Zm0-4v2m0 9v2m6.5-6.5h-2m-9 0h-2m11.1-4.6-1.4 1.4m-6.4 6.4-1.4 1.4m9.2 0-1.4-1.4M4.8 4.8 3.4 3.4" /></svg>
  if (name === 'book') return <svg viewBox="0 0 16 16"><path {...common} d="M3 3h4a2 2 0 0 1 2 2v8a2 2 0 0 0-2-2H3zM9 5a2 2 0 0 1 2-2h2v8h-2a2 2 0 0 0-2 2" /></svg>
  if (name === 'folder') return <svg viewBox="0 0 16 16"><path {...common} d="M2 5h5l1 2h6v6H2z" /></svg>
  if (name === 'file') return <svg viewBox="0 0 16 16"><path {...common} d="M4 2h5l3 3v9H4zM9 2v4h3" /></svg>
  if (name === 'model') return <svg viewBox="0 0 16 16"><path {...common} d="M8 2v12M3 5h10M3 11h10M5 3l6 10M11 3 5 13" /></svg>
  if (name === 'save') return <svg viewBox="0 0 16 16"><path {...common} d="M3 2h9l1 1v11H3zM5 2v5h6V2M5 14v-4h6v4" /></svg>
  if (name === 'keyboard') return <svg viewBox="0 0 16 16"><path {...common} d="M2 4h12v8H2zM4 7h1m2 0h1m2 0h1M4 10h8" /></svg>
  return <svg viewBox="0 0 16 16"><path {...common} d="m8 2 1.2 3.6L13 7 9.2 8.4 8 12 6.8 8.4 3 7l3.8-1.4z" /></svg>
}

function Logo() {
  return (
    <span className="logo-mark" aria-label="AnyReader">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M3 2h8l6 6v10H3z" />
        <path d="M11 2v6h6" />
        <path d="M6 12h8M6 15h6" />
      </svg>
      <strong>AnyReader</strong>
    </span>
  )
}

function IconButton({
  icon,
  label,
  onClick,
  active = false
}: {
  icon: IconName
  label: string
  onClick?: () => void
  active?: boolean
}) {
  return (
    <button className={`icon-button${active ? ' is-active' : ''}`} type="button" title={label} aria-label={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  )
}

function WindowFrame({
  title,
  className = '',
  style,
  actions,
  collapsed,
  children
}: {
  title?: React.ReactNode
  className?: string
  style?: React.CSSProperties
  actions: React.ReactNode
  collapsed?: boolean
  children: React.ReactNode
}) {
  return (
    <section className={`vscode-window ${className}${collapsed ? ' is-collapsed' : ''}`} style={style}>
      <header className="window-titlebar">
        <div className="window-title">{title}</div>
        <div className="window-actions">{actions}</div>
      </header>
      {!collapsed ? <div className="window-body">{children}</div> : null}
    </section>
  )
}

function TreeView({
  nodes,
  rootPath,
  selectedPath,
  collapsedFolders,
  onToggleFolder,
  onOpen
}: {
  nodes: TreeNode[]
  rootPath: string
  selectedPath: string
  collapsedFolders: string[]
  onToggleFolder: (path: string) => void
  onOpen: (path: string) => void
}) {
  const renderNode = (node: TreeNode, depth: number) => {
    const documentPath = node.path
    const fullPath = `${rootPath}/${documentPath}`
    const folderId = `folder:${documentPath}`
    const isCollapsed = collapsedFolders.includes(folderId)
    return (
      <li key={documentPath}>
        <button
          className={`tree-item${documentPath === selectedPath ? ' is-active' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          onClick={() => (node.isDir ? onToggleFolder(folderId) : onOpen(documentPath))}
          title={node.name}
          type="button"
        >
          <Icon name={node.isDir ? 'folder' : 'file'} />
          <span>{node.name.replace(/\.md$/i, '')}</span>
        </button>
        {node.isDir && !isCollapsed && node.children?.length ? (
          <ul>{node.children.map((child) => renderNode({ ...child, path: child.path || fullPath }, depth + 1))}</ul>
        ) : null}
      </li>
    )
  }

  return <ul className="tree-view">{nodes.map((node) => renderNode(node, 0))}</ul>
}

function DirectoryFooter({
  config,
  onMenu,
  onSettings
}: {
  config: AppConfig
  onMenu: (menu: FloatingMenuState) => void
  onSettings: () => void
}) {
  return (
    <footer className="directory-footer">
      <button
        className="footer-model"
        type="button"
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          onMenu({ kind: 'model', x: rect.left, y: rect.top })
        }}
      >
        <Icon name="model" />
        <span>{config.provider?.model || 'model'}</span>
      </button>
      <IconButton icon="settings" label="设置" onClick={onSettings} />
    </footer>
  )
}

function FloatingMenu({
  state,
  config,
  onClose,
  onOpenSettings
}: {
  state: FloatingMenuState
  config: AppConfig
  onClose: () => void
  onOpenSettings: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const items =
    state.kind === 'model'
      ? [
          { icon: 'model' as IconName, label: config.provider?.model || 'gpt-4.1-mini' },
          { icon: 'spark' as IconName, label: `temperature ${config.provider?.temperature ?? 0.3}` },
          { icon: 'settings' as IconName, label: 'provider', action: onOpenSettings }
        ]
      : [
          { icon: 'settings' as IconName, label: 'preferences', action: onOpenSettings },
          { icon: 'keyboard' as IconName, label: 'shortcuts', action: onOpenSettings }
        ]

  return (
    <div ref={ref} className="floating-menu" style={{ left: state.x, top: state.y - 8 }}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          onClick={() => {
            item.action?.()
            onClose()
          }}
        >
          <Icon name={item.icon} />
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  )
}

function AskMenu({
  state,
  templates,
  onPick,
  onClose
}: {
  state: AskMenuState
  templates: PromptTemplate[]
  onPick: (template: PromptTemplate, text: string) => void
  onClose: () => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="ask-context-menu"
      style={{
        left: clamp(state.x, 12, window.innerWidth - 310),
        top: clamp(state.y, 12, window.innerHeight - 260)
      }}
    >
      {templates.map((template) => (
        <button key={template.id} type="button" onClick={() => onPick(template, state.text)}>
          <span style={{ color: template.color }}>{template.title}</span>
          <small>{template.body}</small>
        </button>
      ))}
    </div>
  )
}

function SettingsWindow({
  config,
  onClose,
  onChange,
  onSave
}: {
  config: AppConfig
  onClose: () => void
  onChange: (config: AppConfig) => void
  onSave: () => void
}) {
  const shortcuts = config.shortcuts ?? {}
  const updateShortcut = (key: string, value: string) => {
    onChange({ ...config, shortcuts: { ...shortcuts, [key]: value.toLowerCase() } })
  }
  const templates = [...(config.templates ?? [])].sort((a, b) => a.order - b.order)

  return (
    <WindowFrame
      className="settings-window"
      title="设置"
      actions={<IconButton icon="close" label="关闭" onClick={onClose} />}
    >
      <div className="settings-grid">
        <section>
          <h2>模型</h2>
          <label>
            <span>Base URL</span>
            <input
              value={config.provider?.baseUrl ?? ''}
              onChange={(event) =>
                onChange({ ...config, provider: { ...config.provider, baseUrl: event.target.value } })
              }
            />
          </label>
          <label>
            <span>Model</span>
            <input
              value={config.provider?.model ?? ''}
              onChange={(event) => onChange({ ...config, provider: { ...config.provider, model: event.target.value } })}
            />
          </label>
          <label>
            <span>Temperature</span>
            <input
              type="number"
              min="0"
              max="2"
              step="0.1"
              value={config.provider?.temperature ?? 0.3}
              onChange={(event) =>
                onChange({
                  ...config,
                  provider: { ...config.provider, temperature: Number(event.target.value) }
                })
              }
            />
          </label>
        </section>
        <section>
          <h2>快捷键</h2>
          {[
            ['toggleDirectory', '目录'],
            ['toggleReader', '正文'],
            ['openSettings', '设置'],
            ['closeMenu', '菜单']
          ].map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input value={shortcuts[key] ?? ''} onChange={(event) => updateShortcut(key, event.target.value.slice(-12))} />
            </label>
          ))}
        </section>
        <section className="settings-wide">
          <h2>提问</h2>
          <div className="template-settings">
            {templates.map((template) => (
              <label key={template.id}>
                <span style={{ color: template.color }}>{template.title}</span>
                <input
                  value={template.body}
                  onChange={(event) =>
                    onChange({
                      ...config,
                      templates: templates.map((item) =>
                        item.id === template.id ? { ...item, body: event.target.value } : item
                      )
                    })
                  }
                />
              </label>
            ))}
          </div>
        </section>
      </div>
      <div className="settings-statusbar">
        <button type="button" onClick={onSave}>
          <Icon name="save" />
          <span>保存</span>
        </button>
      </div>
    </WindowFrame>
  )
}

function QaWindow({
  widget,
  templates,
  fontPx,
  onFocus,
  onCollapse,
  onClose,
  onDelete
}: {
  widget: QaWindowState
  templates: PromptTemplate[]
  fontPx: number
  onFocus: () => void
  onCollapse: () => void
  onClose: () => void
  onDelete: () => void
}) {
  const [detailCollapsed, setDetailCollapsed] = useState(true)
  const record = widget.record
  const title = templates.find((template) => template.id === record?.promptTemplateId)?.title || '问答'
  const answerMarkdown = (record?.answerMarkdown || '正在等待回答。').replace(/^##\s*问题\s*\n+/, '')

  return (
    <WindowFrame
      className="qa-window"
      collapsed={widget.collapsed}
      title={title}
      style={{
        left: widget.x,
        top: widget.y,
        width: widget.w,
        height: widget.collapsed ? undefined : widget.h,
        zIndex: widget.z
      }}
      actions={
        <>
          <IconButton icon="chevronUp" label="收起" onClick={onCollapse} active={widget.collapsed} />
          <IconButton icon="close" label="关闭" onClick={onClose} />
          <IconButton icon="trash" label="删除" onClick={onDelete} />
        </>
      }
    >
      <div className="qa-content" style={{ fontSize: fontPx }} onMouseDown={onFocus}>
        <WindowFrame
          className="detail-subwindow"
          title="详情"
          collapsed={detailCollapsed}
          actions={
            <IconButton
              icon="chevronUp"
              label="收起"
              onClick={() => setDetailCollapsed((value) => !value)}
              active={detailCollapsed}
            />
          }
        >
          <dl>
            <dt>选中</dt>
            <dd>{record?.selectedText}</dd>
            <dt>上下文</dt>
            <dd>{record?.readingContextMode}</dd>
          </dl>
        </WindowFrame>
        <div className="question-direct">{record?.questionText}</div>
        <article className="markdown-body">{formatMarkdown(answerMarkdown)}</article>
      </div>
    </WindowFrame>
  )
}

export function App() {
  const [config, setConfig] = useState<AppConfig>(defaultConfig)
  const [tree, setTree] = useState<TreeNode[]>([])
  const [documentPath, setDocumentPath] = useState(defaultConfig().repository?.lastOpenedDocumentPath ?? '')
  const [documentText, setDocumentText] = useState('')
  const [leftCollapsed, setLeftCollapsed] = useState(false)
  const [readerCollapsed, setReaderCollapsed] = useState(false)
  const [readerMaximized, setReaderMaximized] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [askMenu, setAskMenu] = useState<AskMenuState | null>(null)
  const [floatingMenu, setFloatingMenu] = useState<FloatingMenuState | null>(null)
  const [collapsedFolders, setCollapsedFolders] = useState<string[]>([])
  const [qaWindows, setQaWindows] = useState<QaWindowState[]>([])
  const [topZ, setTopZ] = useState(20)
  const readerRef = useRef<HTMLDivElement | null>(null)
  const vaultRoot = normalizeVaultPath(config)

  const templates = useMemo(
    () => [...(config.templates ?? defaultConfig().templates ?? [])].filter((item) => item.isEnabled !== false).sort((a, b) => a.order - b.order),
    [config.templates]
  )

  const persistConfig = useCallback(async (nextConfig: AppConfig) => {
    await writeText('config.json', JSON.stringify(nextConfig, null, 2))
  }, [])

  const persistCanvas = useCallback(async (windows: QaWindowState[]) => {
    const canvas: CanvasFile = {
      id: 'main',
      viewport: { x: 0, y: 0, zoom: 1 },
      widgetStates: windows.map((windowState) => ({
        id: windowState.id,
        position: { x: windowState.x, y: windowState.y },
        size: { w: windowState.w, h: windowState.h },
        zIndex: windowState.z,
        isCollapsed: windowState.collapsed,
        type: 'qa-record',
        props: { qaRecordId: windowState.recordId }
      })),
      selection: windows[0] ? { widgetId: windows[0].id } : undefined,
      updatedAt: new Date().toISOString()
    }
    await writeText('records/canvas/main.json', JSON.stringify(canvas, null, 2))
  }, [])

  useEffect(() => {
    let cancelled = false
    async function boot() {
      const loadedConfig = await readJson<AppConfig>('config.json', defaultConfig())
      if (cancelled) return
      const mergedConfig = { ...defaultConfig(), ...loadedConfig }
      const root = normalizeVaultPath(mergedConfig)
      setConfig(mergedConfig)
      setLeftCollapsed(Boolean(mergedConfig.layout?.leftSidebarCollapsed))
      setCollapsedFolders(mergedConfig.navigation?.collapsedSidebarFolderIds ?? [])
      setDocumentPath(mergedConfig.repository?.lastOpenedDocumentPath || defaultConfig().repository?.lastOpenedDocumentPath || '')
      setTree(await readTree(root))

      const canvas = await readJson<CanvasFile>('records/canvas/main.json', defaultCanvas())
      const bootLeftWidth = mergedConfig.layout?.leftSidebarCollapsed ? RAIL_WIDTH : SIDEBAR_WIDTH
      const windows = await Promise.all(
        canvas.widgetStates
          .filter((widget) => widget.type === 'qa-record' && widget.props.qaRecordId)
          .map(async (widget) => {
            const record = await readJson<QaRecord | null>(`records/qa/${widget.props.qaRecordId}.json`, null)
            const width = clamp(widget.size.w, 320, Math.max(360, window.innerWidth - bootLeftWidth - 40))
            const height = clamp(widget.size.h, 260, Math.max(320, window.innerHeight - 70))
            return {
              id: widget.id,
              recordId: widget.props.qaRecordId || '',
              x: clamp(widget.position.x, bootLeftWidth + 20, Math.max(bootLeftWidth + 20, window.innerWidth - width - 20)),
              y: clamp(widget.position.y, 48, Math.max(48, window.innerHeight - height - 20)),
              w: width,
              h: height,
              z: widget.zIndex,
              collapsed: widget.isCollapsed,
              record: record && !record.lifecycle?.isDeleted ? record : undefined
            }
          })
      )
      if (!cancelled) {
        const visibleWindows = windows.filter((widget) => widget.record)
        setQaWindows(visibleWindows)
        setTopZ(Math.max(20, ...visibleWindows.map((widget) => widget.z + 1)))
      }
    }
    void boot()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!documentPath) return
    void readText(`${vaultRoot}/${documentPath}`, '# 未找到正文').then(setDocumentText)
  }, [documentPath, vaultRoot])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase()
      const shortcuts = config.shortcuts ?? {}
      if (key === (shortcuts.closeMenu || 'escape')) {
        setAskMenu(null)
        setFloatingMenu(null)
      }
      if (key === (shortcuts.toggleDirectory || 'f')) setLeftCollapsed((value) => !value)
      if (key === (shortcuts.toggleReader || 'v')) setReaderCollapsed((value) => !value)
      if (key === (shortcuts.openSettings || ',')) setSettingsOpen(true)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [config.shortcuts])

  const saveConfig = useCallback(
    async (nextConfig: AppConfig) => {
      setConfig(nextConfig)
      await persistConfig(nextConfig)
    },
    [persistConfig]
  )

  const openDocument = async (path: string) => {
    setDocumentPath(path)
    const nextConfig = {
      ...config,
      repository: { ...config.repository, mountedVaultPath: vaultRoot, lastOpenedDocumentPath: path }
    }
    setConfig(nextConfig)
    void persistConfig(nextConfig)
  }

  const toggleFolder = (folderId: string) => {
    const next = collapsedFolders.includes(folderId)
      ? collapsedFolders.filter((item) => item !== folderId)
      : [...collapsedFolders, folderId]
    setCollapsedFolders(next)
    const nextConfig = {
      ...config,
      navigation: { ...config.navigation, collapsedSidebarFolderIds: next }
    }
    setConfig(nextConfig)
    void persistConfig(nextConfig)
  }

  const onReaderMouseUp = () => {
    const selection = window.getSelection()
    const text = selection?.toString().trim()
    if (!selection || !text || !readerRef.current?.contains(selection.anchorNode)) return
    const range = selection.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setAskMenu({ x: rect.left, y: rect.bottom + 8, text })
  }

  const createQa = async (template: PromptTemplate, selectedText: string) => {
    const now = new Date().toISOString()
    const recordId = id()
    const context = stripMarkdown(documentText).slice(0, 1600)
    const record: QaRecord = {
      id: recordId,
      sourceSurface: 'reader',
      sourceDocumentId: documentPath,
      selectedText,
      promptTemplateId: template.id,
      promptIntent: 'custom',
      systemStatePrompt: '你是 AnyReader 的阅读助理。',
      readingContextMode: 'section',
      readingContextSnapshot: context,
      fullPrompt: `状态提示词：\n你是 AnyReader 的阅读助理。\n\n阅读视野上下文（当前小节）：\n${context}\n\n提问：\n${template.body}\n\n被选中的文本：\n${selectedText}`,
      questionText: template.body,
      answerMarkdown: `## 回答\n\n选中的内容是：${selectedText}\n\n${template.body}\n\n当前上下文来自 ${toDocumentTitle(documentPath)}。这里保留原有问答记录格式，新的窗口只负责展示与管理。`,
      answerStatus: 'done',
      modelInfo: {
        provider: config.provider?.baseUrl ? 'OpenAI Compatible' : 'Demo Answer',
        model: config.provider?.model || 'gpt-4.1-mini',
        temperature: config.provider?.temperature ?? 0.3
      },
      visualStyle: {
        color: template.color,
        markerType: 'underline'
      },
      lifecycle: { isDeleted: false },
      createdAt: now,
      updatedAt: now
    }
    const nextZ = topZ + 1
    const windowState: QaWindowState = {
      id: `widget_${crypto.randomUUID()}`,
      recordId,
      x: Math.max((leftCollapsed ? RAIL_WIDTH : SIDEBAR_WIDTH) + 48, window.innerWidth - 560),
      y: 90 + qaWindows.length * 22,
      w: 440,
      h: 520,
      z: nextZ,
      collapsed: false,
      record
    }
    const nextWindows = [...qaWindows, windowState]
    setTopZ(nextZ + 1)
    setQaWindows(nextWindows)
    setAskMenu(null)
    window.getSelection()?.removeAllRanges()
    await writeText(`records/qa/${recordId}.json`, JSON.stringify(record, null, 2))
    await persistCanvas(nextWindows)
  }

  const updateQaWindows = (updater: (widgets: QaWindowState[]) => QaWindowState[]) => {
    setQaWindows((current) => {
      const next = updater(current)
      void persistCanvas(next)
      return next
    })
  }

  const focusQa = (widgetId: string) => {
    const nextZ = topZ + 1
    setTopZ(nextZ)
    updateQaWindows((widgets) => widgets.map((widget) => (widget.id === widgetId ? { ...widget, z: nextZ } : widget)))
  }

  const deleteQa = async (widget: QaWindowState) => {
    if (widget.record) {
      const record = {
        ...widget.record,
        lifecycle: { isDeleted: true, deletedAt: new Date().toISOString() },
        updatedAt: new Date().toISOString()
      }
      await writeText(`records/qa/${widget.recordId}.json`, JSON.stringify(record, null, 2))
    }
    updateQaWindows((widgets) => widgets.filter((item) => item.id !== widget.id))
  }

  const leftWidth = leftCollapsed ? RAIL_WIDTH : SIDEBAR_WIDTH
  const readerLeft = leftWidth
  const readerWidth = readerCollapsed ? RAIL_WIDTH : readerMaximized ? `calc(100vw - ${readerLeft}px)` : 'min(820px, calc(100vw - 360px))'

  return (
    <main className="app-canvas">
      <div className="canvas-grid" />

      <WindowFrame
        className="directory-window"
        collapsed={leftCollapsed}
        title={<Logo />}
        style={{ left: 0, top: 0, width: leftWidth, height: '100vh' }}
        actions={
          <IconButton
            icon={leftCollapsed ? 'chevronRight' : 'chevronLeft'}
            label={leftCollapsed ? '展开目录' : '收起目录'}
            onClick={() => setLeftCollapsed((value) => !value)}
          />
        }
      >
        <div className="directory-content">
          <TreeView
            nodes={tree}
            rootPath={vaultRoot}
            selectedPath={documentPath}
            collapsedFolders={collapsedFolders}
            onToggleFolder={toggleFolder}
            onOpen={openDocument}
          />
          <DirectoryFooter
            config={config}
            onMenu={setFloatingMenu}
            onSettings={() => {
              setFloatingMenu(null)
              setSettingsOpen(true)
            }}
          />
        </div>
      </WindowFrame>

      <WindowFrame
        className="reader-window"
        collapsed={readerCollapsed}
        title={<span className="reader-title-spacer" />}
        style={{ left: readerLeft, top: 0, width: readerWidth, height: '100vh' }}
        actions={
          <>
            <IconButton
              icon={readerCollapsed ? 'chevronRight' : 'chevronLeft'}
              label={readerCollapsed ? '展开正文' : '收起正文'}
              onClick={() => setReaderCollapsed((value) => !value)}
            />
            <IconButton
              icon="maximize"
              label="最大化"
              active={readerMaximized}
              onClick={() => setReaderMaximized((value) => !value)}
            />
          </>
        }
      >
        <article
          ref={readerRef}
          className="reader-article markdown-body"
          style={{ fontSize: config.rendering?.readerFontPx ?? 16 }}
          onMouseUp={onReaderMouseUp}
        >
          <div className="reader-path">{documentPath}</div>
          <h1>{toDocumentTitle(documentPath)}</h1>
          <div className="annotation-sample">
            <span>已标注</span>
            <mark>选中内容会以 VS Code 风格下划线标识</mark>
          </div>
          {formatMarkdown(documentText, documentPath)}
        </article>
      </WindowFrame>

      {qaWindows.map((widget) => (
        <QaWindow
          key={widget.id}
          widget={widget}
          templates={templates}
          fontPx={config.rendering?.widgetFontPx ?? 15}
          onFocus={() => focusQa(widget.id)}
          onCollapse={() =>
            updateQaWindows((widgets) =>
              widgets.map((item) => (item.id === widget.id ? { ...item, collapsed: !item.collapsed } : item))
            )
          }
          onClose={() => updateQaWindows((widgets) => widgets.filter((item) => item.id !== widget.id))}
          onDelete={() => void deleteQa(widget)}
        />
      ))}

      {settingsOpen ? (
        <SettingsWindow
          config={config}
          onClose={() => setSettingsOpen(false)}
          onChange={setConfig}
          onSave={() => void saveConfig(config)}
        />
      ) : null}

      {askMenu ? <AskMenu state={askMenu} templates={templates} onPick={createQa} onClose={() => setAskMenu(null)} /> : null}
      {floatingMenu ? (
        <FloatingMenu
          state={floatingMenu}
          config={config}
          onClose={() => setFloatingMenu(null)}
          onOpenSettings={() => setSettingsOpen(true)}
        />
      ) : null}
    </main>
  )
}
