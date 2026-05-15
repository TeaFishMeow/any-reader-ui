import { useRef, useState } from 'react'
import { createId } from '../../src_original_reference/lib/text'
import { allowedContextModesForNextAsk, sortTemplates } from '../../src_original_reference/lib/app-helpers'
import type { AppConfig, ReadingContextMode, RepositoryBinding } from '../../src_original_reference/types/domain'
import { setThemeMode, setThemeStyle, themeMode, themeStyle, type ThemeMode, type ThemeStyle } from '../lib/theme'
import type { ResizeFrame, ResizeHandle } from '../types'
import { Icon, IconButton } from './Icon'
import { WindowFrame } from './WindowFrame'

const contextLabels: Record<ReadingContextMode, string> = {
  paragraph: '当前段落',
  section: '当前小节',
  directory: '当前目录',
  'viewport-range': '当前屏幕附近',
  'manual-selection': '手动选区',
  'widget-local': '当前窗口',
  'sidebar-node': '左栏节点'
}

export function SettingsWindow({
  config,
  binding,
  frame,
  onClose,
  onChange,
  onResize
}: {
  config: AppConfig
  binding: RepositoryBinding | null
  frame: ResizeFrame
  onClose: () => void
  onChange: (updater: (config: AppConfig) => AppConfig) => void
  onResize: (handle: ResizeHandle, dx: number, dy: number) => void
}) {
  const templates = sortTemplates(config.templates)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<{ id: string; after: boolean } | null>(null)
  const sections = [
    ['settings-theme', '主题'],
    ['settings-shortcuts', '快捷键'],
    ['settings-context', '上下文'],
    ['settings-repository', 'Repository'],
    ['settings-templates', '提问选项']
  ] as const
  const moveTemplate = (sourceId: string, targetId: string, after: boolean) => {
    if (sourceId === targetId) return
    onChange((draft) => {
      const source = draft.templates.find((item) => item.id === sourceId)
      if (!source) return draft
      const rest = sortTemplates(draft.templates).filter((item) => item.id !== sourceId)
      const targetIndex = rest.findIndex((item) => item.id === targetId)
      const insertIndex = targetIndex < 0 ? rest.length : targetIndex + (after ? 1 : 0)
      const templates = [...rest.slice(0, insertIndex), source, ...rest.slice(insertIndex)]
      return { ...draft, templates: templates.map((item, order) => ({ ...item, order })) }
    })
  }
  const templateDropTarget = (container: HTMLDivElement, y: number, sourceId: string) => {
    return [...container.querySelectorAll<HTMLElement>('[data-template-id]')].reduce<{ id: string; after: boolean; distance: number } | null>((best, row) => {
      const id = row.dataset.templateId
      if (!id || id === sourceId) return best
      const rect = row.getBoundingClientRect()
      const edges = [
        { id, after: false, distance: Math.abs(y - rect.top) },
        { id, after: true, distance: Math.abs(y - rect.bottom) }
      ]
      const nearest = edges[0].distance < edges[1].distance ? edges[0] : edges[1]
      return !best || nearest.distance < best.distance ? nearest : best
    }, null)
  }
  return (
    <WindowFrame
      className="settings-window"
      title="设置"
      actions={<IconButton icon="close" label="关闭" onClick={onClose} />}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, transform: 'none' }}
      onResize={onResize}
    >
      <div className="settings-body">
        <aside className="settings-nav">
          {sections.map(([id, label]) => (
            <button key={id} type="button" onClick={() => {
              const container = contentRef.current
              const target = document.getElementById(id)
              if (!container || !target) return
              container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top
            }}>
              {label}
            </button>
          ))}
        </aside>
        <div
          className="settings-content"
          ref={contentRef}
          onDragOver={(event) => {
            if (!draggingTemplateId) return
            const target = templateDropTarget(event.currentTarget, event.clientY, draggingTemplateId)
            if (!target) return
            event.preventDefault()
            setDragTarget(target)
          }}
          onDrop={(event) => {
            if (!draggingTemplateId) return
            const target = templateDropTarget(event.currentTarget, event.clientY, draggingTemplateId)
            if (!target) return
            event.preventDefault()
            moveTemplate(draggingTemplateId, target.id, target.after)
            setDraggingTemplateId(null)
            setDragTarget(null)
          }}
        >
        <section id="settings-theme">
          <h2>主题</h2>
          <label>
            <span>颜色模式</span>
            <select
              value={themeMode(config)}
              onChange={(event) => onChange((draft) => setThemeMode(draft, event.target.value as ThemeMode))}
            >
              <option value="light">浅色模式</option>
              <option value="dark">深色模式</option>
            </select>
          </label>
          <label>
            <span>主题风格</span>
            <select
              value={themeStyle(config)}
              onChange={(event) => onChange((draft) => setThemeStyle(draft, event.target.value as ThemeStyle))}
            >
              <option value="default">当前风格</option>
              <option value="reading">读书风格</option>
            </select>
          </label>
        </section>
        <section id="settings-shortcuts">
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
        <section id="settings-context">
          <h2>上下文</h2>
          <label>
            <span>上下文模式</span>
            <select
              value={config.context.defaultMode}
              onChange={(event) => onChange((draft) => ({
                ...draft,
                context: { ...draft.context, defaultMode: event.target.value as AppConfig['context']['defaultMode'] }
              }))}
            >
              {allowedContextModesForNextAsk().map((mode) => (
                <option key={mode} value={mode}>{contextLabels[mode]}</option>
              ))}
            </select>
          </label>
          <label>
            <span>视野块数</span>
            <input
              type="range"
              min="1"
              max="6"
              value={config.context.viewportRangeBlocks}
              onChange={(event) => onChange((draft) => ({
                ...draft,
                context: { ...draft.context, viewportRangeBlocks: Number(event.target.value) }
              }))}
            />
            <small>{config.context.viewportRangeBlocks} 个块</small>
          </label>
          <label className="settings-textarea">
            <span>学习提示</span>
            <textarea
              value={config.learning.prompt}
              placeholder="描述助手应该优先遵循的学习目标或解释风格。"
              onChange={(event) => onChange((draft) => ({
                ...draft,
                learning: { ...draft.learning, prompt: event.target.value }
              }))}
            />
          </label>
        </section>
        <section id="settings-repository">
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
        <section id="settings-templates" className="settings-wide">
          <h2>提问选项</h2>
          <div className="template-list">
            {templates.map((template) => (
              <div
                className={`template-row${draggingTemplateId === template.id ? ' is-dragging' : ''}${dragTarget?.id === template.id ? (dragTarget.after ? ' is-drop-after' : ' is-drop-before') : ''}`}
                key={template.id}
                data-template-id={template.id}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', template.id)
                  setDraggingTemplateId(template.id)
                }}
                onDragEnd={() => {
                  setDraggingTemplateId(null)
                  setDragTarget(null)
                }}
              >
                <span className="template-drag" aria-hidden="true">
                  <Icon name="drag" />
                </span>
                <input type="checkbox" checked={template.isEnabled} aria-label="启用" onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, isEnabled: event.target.checked } : item) }))} />
                <input className="template-color" type="color" value={template.color} aria-label="颜色" onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, color: event.target.value } : item) }))} />
                <input value={template.title} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, title: event.target.value } : item) }))} />
                <input value={template.body} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, body: event.target.value } : item) }))} />
                <button className="template-delete" type="button" aria-label="删除" onClick={() => onChange((draft) => ({ ...draft, templates: draft.templates.filter((item) => item.id !== template.id) }))}>
                  <Icon name="close" />
                </button>
              </div>
            ))}
            <button className="template-add" type="button" aria-label="新增" onClick={() => onChange((draft) => ({
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
            }))}>
              <Icon name="plus" />
            </button>
          </div>
        </section>
        </div>
      </div>
    </WindowFrame>
  )
}
