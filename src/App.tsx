import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { bootstrapWorkspace, deleteQaRecord, saveQaRecord, saveWorkspaceState } from '../src_original_reference/lib/bootstrap'
import { fetchRemoteDocument } from '../src_original_reference/lib/api'
import { applyPromptTemplateDefaults, MAIN_CANVAS_ID } from '../src_original_reference/lib/defaults'
import {
  buildContextPreview,
  buildPendingAskSession,
  createPendingRecord,
  nextWidgetFrame,
  normalizeCanvasViewport,
  sortTemplates,
  upsertQaRecord
} from '../src_original_reference/lib/app-helpers'
import { buildModelInfo, streamAnswer } from '../src_original_reference/lib/provider'
import { clamp, createId, makeSummary, markdownToPlainText } from '../src_original_reference/lib/text'
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

type IconName =
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronUp'
  | 'chevronDown'
  | 'maximize'
  | 'close'
  | 'trash'
  | 'settings'
  | 'folder'
  | 'file'
  | 'spark'
  | 'save'
  | 'keyboard'
  | 'plus'
  | 'minus'

type ModalName = 'settings' | null
type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'
type ResizeFrame = { x: number; y: number; w: number; h: number }

interface AskMenuState {
  session: ReturnType<typeof buildPendingAskSession>
  hoveredTemplateId: string | null
}

interface MenuState {
  kind: 'model' | 'settings'
  x: number
  y: number
}

const LEFT_DEFAULT = 280
const RAIL_WIDTH = 36
const READER_WIDTH = 780
const PERSIST_DELAY_MS = 450
const VIEWPORT_HEIGHT = () => (typeof window === 'undefined' ? 720 : window.innerHeight)

function isAbortError(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}

function titleForDocument(document: DocumentNode) {
  return document.title.trim() || document.path.split('/').pop()?.replace(/\.md$/i, '') || document.path
}

function iconPath(name: IconName) {
  switch (name) {
    case 'chevronLeft':
      return 'M10.5 3.5 6 8l4.5 4.5'
    case 'chevronRight':
      return 'M5.5 3.5 10 8l-4.5 4.5'
    case 'chevronUp':
      return 'M3.5 10.5 8 6l4.5 4.5'
    case 'chevronDown':
      return 'M3.5 5.5 8 10l4.5-4.5'
    case 'maximize':
      return 'M4 4h8v8H4z'
    case 'close':
      return 'M4.5 4.5 11.5 11.5M11.5 4.5 4.5 11.5'
    case 'trash':
      return 'M3.5 4.5h9M6.5 2.75h3M5 4.5v7.25c0 .4.35.75.75.75h4.5c.4 0 .75-.35.75-.75V4.5M6.75 6.5v4M9.25 6.5v4'
    case 'settings':
      return 'M8 5.5A2.5 2.5 0 1 0 8 10.5 2.5 2.5 0 0 0 8 5.5ZM8 1.75v2M8 12.25v2M14.25 8h-2M3.75 8h-2M12.42 3.58 11 5M5 11l-1.42 1.42M12.42 12.42 11 11M5 5 3.58 3.58'
    case 'folder':
      return 'M2 4.5h4.25l1 1.5H14v6.5H2z'
    case 'file':
      return 'M4 2.5h5.25L12 5.25v8.25H4zM9.25 2.5v3h3'
    case 'spark':
      return 'M8 2.5 9.35 6.65 13.5 8l-4.15 1.35L8 13.5 6.65 9.35 2.5 8l4.15-1.35z'
    case 'save':
      return 'M3 2.5h8.5L13 4v9.5H3zM5 2.5v4h5v-4M5 13.5v-4h6v4'
    case 'keyboard':
      return 'M2.5 4.5h11v7h-11zM4.5 7h1M7 7h1M9.5 7h1M4.5 9.5h7'
    case 'plus':
      return 'M8 3.5v9M3.5 8h9'
    case 'minus':
      return 'M3.5 8h9'
  }
}

function Icon({ name }: { name: IconName }) {
  return (
    <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
      <path d={iconPath(name)} />
    </svg>
  )
}

function IconButton({
  icon,
  label,
  active,
  danger,
  onClick
}: {
  icon: IconName
  label: string
  active?: boolean
  danger?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={`icon-button${active ? ' is-active' : ''}${danger ? ' danger' : ''}`}
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={icon} />
    </button>
  )
}

function resizeFrame(handle: ResizeHandle, frame: ResizeFrame, dx: number, dy: number, minW = 260, minH = 220) {
  const west = handle.includes('w')
  const east = handle.includes('e')
  const north = handle.includes('n')
  const south = handle.includes('s')
  const nextW = Math.max(minW, frame.w + (east ? dx : 0) - (west ? dx : 0))
  const nextH = Math.max(minH, frame.h + (south ? dy : 0) - (north ? dy : 0))
  return {
    x: west ? frame.x + frame.w - nextW : frame.x,
    y: north ? frame.y + frame.h - nextH : frame.y,
    w: nextW,
    h: nextH
  }
}

function ResizeHandles({
  handles = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'],
  onResize
}: {
  handles?: ResizeHandle[]
  onResize: (handle: ResizeHandle, dx: number, dy: number) => void
}) {
  return (
    <>
      {handles.map((handle) => (
        <button
          key={handle}
          type="button"
          className={`resize-handle resize-handle-${handle}`}
          aria-label="调整窗口大小"
          onPointerDown={(event) => {
            event.preventDefault()
            event.stopPropagation()
            event.currentTarget.setPointerCapture(event.pointerId)
            const startX = event.clientX
            const startY = event.clientY
            const move = (moveEvent: PointerEvent) => onResize(handle, moveEvent.clientX - startX, moveEvent.clientY - startY)
            const done = () => {
              window.removeEventListener('pointermove', move)
              window.removeEventListener('pointerup', done)
              window.removeEventListener('pointercancel', done)
            }
            window.addEventListener('pointermove', move)
            window.addEventListener('pointerup', done)
            window.addEventListener('pointercancel', done)
          }}
        />
      ))}
    </>
  )
}

function WindowFrame({
  title,
  actions,
  className = '',
  collapsed,
  style,
  onMouseDown,
  onResize,
  resizeHandles,
  children
}: {
  title?: ReactNode
  actions: ReactNode
  className?: string
  collapsed?: boolean
  style?: CSSProperties
  onMouseDown?: () => void
  onResize?: (handle: ResizeHandle, dx: number, dy: number) => void
  resizeHandles?: ResizeHandle[]
  children: ReactNode
}) {
  return (
    <section className={`window-frame ${className}${collapsed ? ' is-collapsed' : ''}`} style={style} onMouseDown={onMouseDown}>
      <header className="window-titlebar" data-window-drag="true">
        <div className="window-title">{title}</div>
        <div className="window-actions">{actions}</div>
      </header>
      {!collapsed ? <div className="window-body">{children}</div> : null}
      {!collapsed && onResize ? <ResizeHandles handles={resizeHandles} onResize={onResize} /> : null}
    </section>
  )
}

function Logo() {
  return (
    <span className="logo">
      <svg viewBox="0 0 20 20" focusable="false" aria-hidden="true">
        <path d="M3 2.5h8l6 6v9H3z" />
        <path d="M11 2.5v6h6" />
        <path d="M6 12h8M6 15h5" />
      </svg>
      <strong>AnyReader</strong>
    </span>
  )
}

function markdownBlocks(markdown: string, documentPath?: string) {
  const chunks = markdown.split(/\n{2,}/)
  return chunks.map((raw, index) => {
    const block = raw.trim()
    if (!block) return null
    const image = block.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*(.*)$/s)
    if (image) {
      return (
        <figure className="markdown-figure" key={index}>
          <img src={resolveAssetPath(documentPath, image[2])} alt={image[1]} />
          {image[3].trim() ? <figcaption>{image[3].trim()}</figcaption> : null}
        </figure>
      )
    }
    if (/^#{1,6}\s/.test(block)) {
      const text = block.replace(/^#{1,6}\s*/, '')
      if (block.startsWith('# ')) return <h1 key={index}>{text}</h1>
      if (block.startsWith('## ')) return <h2 key={index}>{text}</h2>
      return <h3 key={index}>{text}</h3>
    }
    if (/^\$\$[\s\S]*\$\$$/.test(block)) {
      return <pre className="math-block" key={index}>{block.replace(/^\$\$|\$\$$/g, '').trim()}</pre>
    }
    if (/^[-*]\s/m.test(block)) {
      return (
        <ul key={index}>
          {block.split(/\n/).map((line, itemIndex) => <li key={itemIndex}>{line.replace(/^[-*]\s*/, '')}</li>)}
        </ul>
      )
    }
    return <p key={index}>{block}</p>
  })
}

function resolveAssetPath(documentPath: string | undefined, raw: string) {
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw
  const base = documentPath ? documentPath.split('/').slice(0, -1) : []
  const output: string[] = []
  for (const part of [...base, ...raw.split('/')]) {
    if (!part || part === '.') continue
    if (part === '..') output.pop()
    else output.push(part)
  }
  return `/vault/${output.map(encodeURIComponent).join('/')}`
}

function plainContextForDocument(document: DocumentNode) {
  return document.contentPlainText || markdownToPlainText(document.contentMd)
}

function displayAnswerMarkdown(markdown: string) {
  return markdown.replace(/^##\s*问题\s*\n+/, '')
}

function selectionAction(args: {
  eventPoint: { x: number; y: number }
  surface: AskAction['surface']
  target: AskAction['target']
  surfaceTitle: string
  surfaceText: string
  sourceQaRecordId?: string
}): AskAction | null {
  const selection = window.getSelection()
  const text = selection?.toString().trim()
  if (!selection || !text) return null
  const content = args.surfaceText
  const startOffset = content.indexOf(text)
  const endOffset = startOffset >= 0 ? startOffset + text.length : undefined
  const radius = 180
  return {
    surface: args.surface,
    target: args.target,
    surfaceTitle: args.surfaceTitle,
    sourceQaRecordId: args.sourceQaRecordId,
    selection: {
      text,
      kind: 'plain',
      startOffset: startOffset >= 0 ? startOffset : undefined,
      endOffset,
      surfaceText: content,
      contextPrefix: startOffset >= 0 ? content.slice(Math.max(0, startOffset - radius), startOffset) : undefined,
      contextSuffix: endOffset !== undefined ? content.slice(endOffset, endOffset + radius) : undefined,
      anchorQuote: text
    },
    menuPoint: args.eventPoint
  }
}

function Sidebar({
  repo,
  nodes,
  documents,
  currentDocumentId,
  collapsedIds,
  onToggle,
  onOpen,
  onAsk
}: {
  repo: RepoMeta
  nodes: SidebarNode[]
  documents: DocumentNode[]
  currentDocumentId: string
  collapsedIds: string[]
  onToggle: (nodeId: string) => void
  onOpen: (documentId: string) => void
  onAsk: (action: AskAction) => void
}) {
  const collapsedSet = useMemo(() => new Set(collapsedIds), [collapsedIds])
  const documentMap = useMemo(() => new Map(documents.map((document) => [document.id, document])), [documents])
  const childrenMap = useMemo(() => {
    const map = new Map<string, SidebarNode[]>()
    nodes.forEach((node) => {
      if (!node.parentId) return
      map.set(node.parentId, [...(map.get(node.parentId) ?? []), node])
    })
    return map
  }, [nodes])

  const collectText = (node: SidebarNode): string => {
    if (node.type === 'document') return documentMap.get(node.documentId ?? node.id)?.contentPlainText ?? node.label
    const queue = [...(childrenMap.get(node.id) ?? [])]
    const parts: string[] = []
    while (queue.length) {
      const item = queue.shift()
      if (!item) continue
      if (item.type === 'document') {
        const document = documentMap.get(item.documentId ?? item.id)
        if (document) parts.push(`# ${document.title}\n${document.contentPlainText}`)
      } else {
        queue.push(...(childrenMap.get(item.id) ?? []))
      }
    }
    return parts.join('\n\n')
  }

  const openNodeMenu = (event: React.MouseEvent, node: SidebarNode) => {
    event.preventDefault()
    onAsk({
      surface: 'sidebar',
      target: {
        sidebarNodeId: node.id,
        sidebarNodeType: node.type,
        sidebarLabel: node.label
      },
      selection: {
        text: node.label,
        kind: 'node-label',
        surfaceText: collectText(node)
      },
      surfaceTitle: node.label,
      menuPoint: { x: event.clientX, y: event.clientY }
    })
  }

  const renderNode = (node: SidebarNode, depth = 0) => {
    const children = childrenMap.get(node.id) ?? []
    const expandable = children.length > 0
    const collapsed = collapsedSet.has(node.id)
    const active = node.type === 'document' && (node.documentId ?? node.id) === currentDocumentId
    return (
      <li key={node.id}>
        <button
          className={`tree-item${active ? ' is-active' : ''}`}
          style={{ paddingLeft: 8 + depth * 14 }}
          type="button"
          onClick={() => node.type === 'document' ? onOpen(node.documentId ?? node.id) : expandable ? onToggle(node.id) : undefined}
          onContextMenu={(event) => openNodeMenu(event, node)}
        >
          <Icon name={node.type === 'document' ? 'file' : 'folder'} />
          <span>{node.label}</span>
        </button>
        {expandable && !collapsed ? <ul>{children.map((child) => renderNode(child, depth + 1))}</ul> : null}
      </li>
    )
  }

  return <ul className="tree-list">{(childrenMap.get(repo.id) ?? []).map((node) => renderNode(node))}</ul>
}

function AskMenu({
  state,
  templates,
  onHover,
  onPick,
  onClose
}: {
  state: AskMenuState
  templates: PromptTemplate[]
  onHover: (templateId: string) => void
  onPick: (template: PromptTemplate) => void
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
      className="ask-menu"
      style={{
        left: clamp(state.session.action.menuPoint.x, 12, window.innerWidth - 340),
        top: clamp(state.session.action.menuPoint.y, 12, window.innerHeight - 260)
      }}
    >
      {templates.map((template) => (
        <button
          key={template.id}
          className={template.id === state.hoveredTemplateId ? 'is-hovered' : ''}
          type="button"
          onMouseEnter={() => onHover(template.id)}
          onFocus={() => onHover(template.id)}
          onClick={() => onPick(template)}
        >
          <span style={{ color: template.color }}>{template.title}</span>
          <small>{template.body}</small>
        </button>
      ))}
    </div>
  )
}

function FloatingMenu({
  state,
  config,
  llmAccess,
  onClose,
  onOpenSettings,
  onSelectModel
}: {
  state: MenuState
  config: AppConfig
  llmAccess: LlmAccessState | null
  onClose: () => void
  onOpenSettings: () => void
  onSelectModel: (modelId: string) => void
}) {
  const ref = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) onClose()
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [onClose])

  const models = llmAccess?.models ?? []
  return (
    <div ref={ref} className="floating-menu" style={{ left: state.x, top: state.y }}>
      {state.kind === 'model' ? (
        models.length ? models.map((model) => (
          <button key={model.id} type="button" onClick={() => { onSelectModel(model.id); onClose() }}>
            <Icon name="spark" />
            <span>{model.displayName || model.model}</span>
          </button>
        )) : (
          <button type="button">
            <Icon name="spark" />
            <span>{config.provider.model}</span>
          </button>
        )
      ) : (
        <button type="button" onClick={() => { onOpenSettings(); onClose() }}>
          <Icon name="settings" />
          <span>Settings</span>
        </button>
      )}
    </div>
  )
}

function SettingsWindow({
  config,
  binding,
  frame,
  onClose,
  onChange,
  onSave,
  onAddTemplate,
  onResize
}: {
  config: AppConfig
  binding: RepositoryBinding | null
  frame: ResizeFrame
  onClose: () => void
  onChange: (updater: (config: AppConfig) => AppConfig) => void
  onSave: () => void
  onAddTemplate: () => void
  onResize: (handle: ResizeHandle, dx: number, dy: number) => void
}) {
  const templates = sortTemplates(config.templates)
  return (
    <WindowFrame
      className="settings-window"
      title="设置"
      actions={<IconButton icon="close" label="关闭" onClick={onClose} />}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, transform: 'none' }}
      onResize={onResize}
    >
      <div className="settings-body">
        <section>
          <h2>Provider</h2>
          <label>
            <span>Base URL</span>
            <input value={config.provider.baseUrl} onChange={(event) => onChange((draft) => ({ ...draft, provider: { ...draft.provider, baseUrl: event.target.value } }))} />
          </label>
          <label>
            <span>API Key</span>
            <input value={config.provider.apiKey} onChange={(event) => onChange((draft) => ({ ...draft, provider: { ...draft.provider, apiKey: event.target.value } }))} />
          </label>
          <label>
            <span>Model</span>
            <input value={config.provider.model} onChange={(event) => onChange((draft) => ({ ...draft, provider: { ...draft.provider, model: event.target.value } }))} />
          </label>
          <label>
            <span>Temperature</span>
            <input type="number" min="0" max="2" step="0.1" value={config.provider.temperature} onChange={(event) => onChange((draft) => ({ ...draft, provider: { ...draft.provider, temperature: Number(event.target.value) } }))} />
          </label>
        </section>
        <section>
          <h2>快捷键</h2>
          {([
            ['toggleLeft', '目录'],
            ['toggleRight', '正文'],
            ['openContext', '上下文']
          ] as const).map(([key, label]) => (
            <label key={key}>
              <span>{label}</span>
              <input value={config.shortcuts[key]} onChange={(event) => onChange((draft) => ({ ...draft, shortcuts: { ...draft.shortcuts, [key]: event.target.value.slice(-1).toLowerCase() || draft.shortcuts[key] } }))} />
            </label>
          ))}
        </section>
        <section>
          <h2>Repository</h2>
          <label>
            <span>Mode</span>
            <input readOnly value={binding?.activeSourceMode ?? config.repository.sourceMode} />
          </label>
          <label>
            <span>Source</span>
            <input readOnly value={binding?.sourceLabel ?? config.repository.mountedVaultPath ?? ''} />
          </label>
        </section>
        <section className="settings-wide">
          <h2>提问选项</h2>
          <button className="settings-command" type="button" onClick={onAddTemplate}>
            <Icon name="plus" />
            <span>新增</span>
          </button>
          <div className="template-list">
            {templates.map((template) => (
              <div className="template-row" key={template.id}>
                <input value={template.title} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, title: event.target.value } : item) }))} />
                <input value={template.body} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, body: event.target.value } : item) }))} />
                <label className="inline-check">
                  <input type="checkbox" checked={template.isEnabled} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, isEnabled: event.target.checked } : item) }))} />
                  <span>启用</span>
                </label>
              </div>
            ))}
          </div>
        </section>
      </div>
      <footer className="settings-footer">
        <button className="settings-command primary" type="button" onClick={onSave}>
          <Icon name="save" />
          <span>保存</span>
        </button>
      </footer>
    </WindowFrame>
  )
}

function DetailWindow({
  open,
  selectedText,
  context,
  onToggle
}: {
  open: boolean
  selectedText: string
  context: string
  onToggle: () => void
}) {
  return (
    <WindowFrame
      className="detail-window"
      title="详情"
      collapsed={!open}
      actions={<IconButton icon={open ? 'chevronUp' : 'chevronDown'} label="收起" active={!open} onClick={onToggle} />}
    >
      <div className="detail-body">
        <div>
          <span>选中</span>
          <p>{selectedText}</p>
        </div>
        <div>
          <span>上下文</span>
          <p>{makeSummary(context, 360)}</p>
        </div>
      </div>
    </WindowFrame>
  )
}

function QaWidget({
  widget,
  record,
  documents,
  config,
  onFocus,
  onFrameChange,
  onToggle,
  onClose,
  onDelete,
  onAsk
}: {
  widget: WidgetState
  record: QARecord | null
  documents: DocumentNode[]
  config: AppConfig
  onFocus: () => void
  onFrameChange: (frame: ResizeFrame) => void
  onToggle: () => void
  onClose: () => void
  onDelete: () => void
  onAsk: (action: AskAction) => void
}) {
  const [detailsOpen, setDetailsOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)
  const drag = (event: React.PointerEvent) => {
    if ((event.target as HTMLElement).closest('button,input,textarea,.window-body')) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const sx = event.clientX
    const sy = event.clientY
    const ox = widget.position.x
    const oy = widget.position.y
    const move = (moveEvent: PointerEvent) =>
      onFrameChange({
        x: ox + moveEvent.clientX - sx,
        y: oy + moveEvent.clientY - sy,
        w: widget.size.w,
        h: widget.size.h
      })
    const done = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', done)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', done)
  }
  const sourceDocument = record?.sourceDocumentId ? documents.find((document) => document.id === record.sourceDocumentId) : null
  const answerText = displayAnswerMarkdown(record?.answerMarkdown || (record?.answerStatus === 'pending' ? '等待回答...' : ''))
  const title = record
    ? sortTemplates(config.templates).find((template) => template.id === record.promptTemplateId)?.title || record.customPromptTitle || '问答'
    : '问答'
  const surfaceText = record ? markdownToPlainText(answerText) : ''

  return (
    <WindowFrame
      className="qa-window"
      title={title}
      collapsed={widget.isCollapsed}
      style={{
        left: widget.position.x,
        top: widget.position.y,
        width: widget.size.w,
        height: widget.isCollapsed ? undefined : widget.size.h,
        zIndex: widget.zIndex
      }}
      onResize={(handle, dx, dy) =>
        onFrameChange(resizeFrame(handle, {
          x: widget.position.x,
          y: widget.position.y,
          w: widget.size.w,
          h: widget.size.h
        }, dx, dy))
      }
      actions={
        <>
          <IconButton icon={widget.isCollapsed ? 'chevronDown' : 'chevronUp'} label="收起" active={widget.isCollapsed} onClick={onToggle} />
          <IconButton icon="trash" label="删除" danger onClick={onDelete} />
          <IconButton icon="close" label="关闭" onClick={onClose} />
        </>
      }
      onMouseDown={onFocus}
    >
      <div ref={ref} className="qa-inner" onPointerDown={drag}>
        <DetailWindow
          open={detailsOpen}
          selectedText={record?.selectedText ?? ''}
          context={record?.readingContextSnapshot ?? ''}
          onToggle={() => setDetailsOpen((value) => !value)}
        />
        <div className="question-text">{record?.questionText}</div>
        <article
          className="markdown-body"
          style={{ fontSize: config.rendering.widgetFontPx }}
          onMouseUp={(event) => {
            const action = record ? selectionAction({
              eventPoint: { x: event.clientX, y: event.clientY + 8 },
              surface: 'widget',
              target: { widgetId: widget.id },
              sourceQaRecordId: record.id,
              surfaceTitle: title,
              surfaceText
            }) : null
            if (action) onAsk(action)
          }}
        >
          {markdownBlocks(answerText, sourceDocument?.path)}
        </article>
      </div>
    </WindowFrame>
  )
}

export function App() {
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
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable) return
      const key = event.key.toLowerCase()
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
  }, [config])

  async function openDocument(documentId: string) {
    if (!repo || !config) return
    const document = documentMap.get(documentId)
    if (binding?.activeSourceMode === 'remote-library' && document && !document.isContentLoaded && binding.libraryId) {
      try {
        const loaded = await fetchRemoteDocument(documentId, binding.libraryId)
        setDocuments((previous) => previous.map((item) => item.id === documentId ? loaded : item))
      } catch (loadError) {
        console.error(loadError)
      }
    }
    setRepo({ ...repo, currentDocumentId: documentId, updatedAt: new Date().toISOString() })
    if (document) {
      updateConfig((draft) => ({
        ...draft,
        repository: { ...draft.repository, lastOpenedDocumentPath: document.path }
      }))
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
    openWidget((draft) => ({
      ...nextWidgetFrame(draft, { width: window.innerWidth, height: window.innerHeight }),
      type: 'qa-record',
      props: { qaRecordId: record.id }
    }))
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

  if (loading) return <div className="boot">Loading workspace...</div>
  if (error || !repo || !config || !canvas || !currentDocument) return <div className="boot">{error ?? 'Missing workspace state'}</div>

  const leftWidth = config.layout.leftSidebarCollapsed ? RAIL_WIDTH : directoryFrame.w
  const readerLeft = leftWidth
  const readerWidth = config.layout.rightSidebarCollapsed ? RAIL_WIDTH : readerMaximized ? window.innerWidth - readerLeft : readerFrame.w
  const viewport = normalizeCanvasViewport(canvas.viewport)
  const visibleWidgets = canvas.widgetStates.filter((widget) => {
    if (widget.type === 'ask') return true
    return activeRecords.some((record) => record.id === widget.props.qaRecordId)
  })

  return (
    <main className="app-canvas">
      <div className="canvas-grid" />
      <div
        className="canvas-scene"
        style={{ transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest('.window-frame')) return
          const start = { x: event.clientX, y: event.clientY, vx: viewport.x, vy: viewport.y }
          const move = (moveEvent: PointerEvent) => updateCanvas((draft) => ({ ...draft, viewport: { ...draft.viewport, x: start.vx + moveEvent.clientX - start.x, y: start.vy + moveEvent.clientY - start.y } }))
          const done = () => {
            window.removeEventListener('pointermove', move)
            window.removeEventListener('pointerup', done)
          }
          window.addEventListener('pointermove', move)
          window.addEventListener('pointerup', done)
        }}
      >
        {visibleWidgets.map((widget) => {
          const record = widget.type === 'qa-record' ? activeRecords.find((item) => item.id === widget.props.qaRecordId) ?? null : null
          return (
            <QaWidget
              key={widget.id}
              widget={widget}
              record={record}
              documents={documents}
              config={config}
              onFocus={() => updateCanvas((draft) => {
                const z = Math.max(0, ...draft.widgetStates.map((item) => item.zIndex)) + 1
                return { ...draft, widgetStates: draft.widgetStates.map((item) => item.id === widget.id ? { ...item, zIndex: z } : item), selection: { widgetId: widget.id } }
              })}
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
            />
          )
        })}
      </div>

      <WindowFrame
        className="directory-window"
        collapsed={config.layout.leftSidebarCollapsed}
        title={<Logo />}
        style={{ left: 0, top: directoryFrame.y, width: leftWidth, height: directoryFrame.h, zIndex: 20 }}
        resizeHandles={['e']}
        onResize={(handle, dx, dy) => {
          const frame = resizeFrame(handle, { x: 0, y: directoryFrame.y, w: leftWidth, h: directoryFrame.h }, dx, dy, RAIL_WIDTH, 160)
          setDirectoryFrame({ ...frame, x: 0 })
          updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarWidth: frame.w } }))
        }}
        actions={<IconButton icon={config.layout.leftSidebarCollapsed ? 'chevronRight' : 'chevronLeft'} label="目录" onClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, leftSidebarCollapsed: !draft.layout.leftSidebarCollapsed } }))} />}
      >
        <div className="directory-body">
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
          <footer className="directory-footer">
            <button
              type="button"
              onClick={(event) => {
                const rect = event.currentTarget.getBoundingClientRect()
                setFloatingMenu({ kind: 'model', x: rect.left, y: rect.top })
              }}
            >
              <Icon name="spark" />
              <span>{llmAccess?.dailyRemaining ?? llmAccess?.creditBalance ?? config.provider.model}</span>
            </button>
            <IconButton icon="settings" label="设置" onClick={() => setModal('settings')} />
          </footer>
        </div>
      </WindowFrame>

      <WindowFrame
        className="reader-window"
        collapsed={config.layout.rightSidebarCollapsed}
        title={<span />}
        style={{ left: readerLeft, top: readerFrame.y, width: readerWidth, height: readerFrame.h, zIndex: 18 }}
        resizeHandles={['e']}
        onResize={(handle, dx, dy) => {
          const frame = resizeFrame(handle, { x: readerLeft, y: readerFrame.y, w: Number(readerWidth), h: readerFrame.h }, dx, dy, RAIL_WIDTH, 160)
          setReaderMaximized(false)
          setReaderFrame({ ...frame, x: readerLeft })
          updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarWidth: frame.w } }))
        }}
        actions={
          <>
            {!config.layout.rightSidebarCollapsed ? (
              <IconButton icon="maximize" label="最大化" active={readerMaximized} onClick={() => setReaderMaximized((value) => !value)} />
            ) : null}
            <IconButton icon={config.layout.rightSidebarCollapsed ? 'chevronRight' : 'chevronLeft'} label="正文" onClick={() => updateConfig((draft) => ({ ...draft, layout: { ...draft.layout, rightSidebarCollapsed: !draft.layout.rightSidebarCollapsed } }))} />
          </>
        }
      >
        <article
          className="reader-body markdown-body"
          style={{ fontSize: config.rendering.readerFontPx }}
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
          <div className="reader-path">{currentDocument.path}</div>
          {markdownBlocks(currentDocument.contentMd, currentDocument.path)}
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
        <SettingsWindow
          config={config}
          binding={binding}
          frame={settingsFrame}
          onClose={() => setModal(null)}
          onChange={updateConfig}
          onSave={() => void saveWorkspaceState({ config, canvas, version: workspaceVersion })}
          onResize={(handle, dx, dy) => setSettingsFrame((frame) => resizeFrame(handle, frame, dx, dy, 360, 260))}
          onAddTemplate={() => updateConfig((draft) => ({
            ...draft,
            templates: [
              ...draft.templates,
              {
                id: createId('template'),
                title: '新选项',
                body: '输入提示词。',
                color: '#569cd6',
                order: draft.templates.length,
                isBuiltIn: false,
                isEnabled: true,
                scope: 'global'
              }
            ]
          }))}
        />
      ) : null}

      <div className={`persist-status ${persistState}`}>{persistState}</div>
    </main>
  )
}
