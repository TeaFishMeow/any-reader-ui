import { useRef } from 'react'
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
  onSave,
  onResize
}: {
  config: AppConfig
  binding: RepositoryBinding | null
  frame: ResizeFrame
  onClose: () => void
  onChange: (updater: (config: AppConfig) => AppConfig) => void
  onSave: () => void
  onResize: (handle: ResizeHandle, dx: number, dy: number) => void
}) {
  const templates = sortTemplates(config.templates)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const sections = [
    ['settings-provider', 'Provider'],
    ['settings-shortcuts', '快捷键'],
    ['settings-repository', 'Repository'],
    ['settings-templates', '提问选项']
  ] as const
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
        <div className="settings-content" ref={contentRef}>
        <section id="settings-provider">
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
          <button className="settings-command" type="button" onClick={() => onChange((draft) => ({
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
