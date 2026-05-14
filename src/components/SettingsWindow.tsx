import { useRef, useState } from 'react'
import { createId } from '../../src_original_reference/lib/text'
import { sortTemplates } from '../../src_original_reference/lib/app-helpers'
import type { AppConfig, RepositoryBinding } from '../../src_original_reference/types/domain'
import type { ResizeFrame, ResizeHandle } from '../types'
import { Icon, IconButton } from './Icon'
import { WindowFrame } from './WindowFrame'

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
    ['settings-shortcuts', '快捷键'],
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
