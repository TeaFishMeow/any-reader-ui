import { useRef, useState } from 'react'
import { createId } from '../lib/text'
import { allowedContextModesForNextAsk, sortTemplates } from '../lib/app-helpers'
import type { AppConfig, ReadingContextMode, RepositoryBinding } from '../domain'
import { localeOptions, useI18n, type Locale, type MessageKey } from '../i18n'
import {
  setThemeChineseFont,
  setThemeEnglishFont,
  setThemeMode,
  setThemeStyle,
  themeChineseFont,
  themeEnglishFont,
  themeMode,
  themeStyle,
  type ChineseFont,
  type EnglishFont,
  type ThemeMode,
  type ThemeStyle
} from '../lib/theme'
import { askSubmitShortcut, setAskSubmitShortcut, type AskSubmitShortcut } from '../lib/askInput'
import { chineseFontOptions, englishFontOptions } from '../lib/themeFonts'
import { setShortcut, shortcutFromEvent, shortcutValue, type ShortcutAction } from '../lib/shortcuts'
import { fitTextarea } from '../lib/textarea'
import { isCustomAskTemplate, isNoteTemplate } from '../lib/promptTemplates'
import type { ResizeFrame, ResizeHandle } from '../types'
import { Icon, IconButton } from './Icon'
import { WindowFrame } from './WindowFrame'

const contextLabelKeys: Record<ReadingContextMode, MessageKey> = {
  paragraph: 'contextMode.paragraph',
  section: 'contextMode.section',
  directory: 'contextMode.directory',
  'viewport-range': 'contextMode.viewport-range',
  'manual-selection': 'contextMode.manual-selection',
  'widget-local': 'contextMode.widget-local',
  'sidebar-node': 'contextMode.sidebar-node'
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
  const { locale, setLocale, t } = useI18n()
  const templates = sortTemplates(config.templates)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null)
  const [dragTarget, setDragTarget] = useState<{ id: string; after: boolean } | null>(null)
  const [submitShortcut, setSubmitShortcutState] = useState(askSubmitShortcut)
  const sections = [
    ['settings-theme', 'settings.section.theme'],
    ['settings-shortcuts', 'settings.section.shortcuts'],
    ['settings-context', 'settings.section.context'],
    ['settings-repository', 'settings.section.repository'],
    ['settings-templates', 'settings.section.templates']
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
      title={t('common.settings')}
      actions={<IconButton icon="close" label={t('common.close')} onClick={onClose} />}
      style={{ left: frame.x, top: frame.y, width: frame.w, height: frame.h, transform: 'none' }}
      onResize={onResize}
    >
      <div className="settings-body">
        <aside className="settings-nav">
          {sections.map(([id, labelKey]) => (
            <button key={id} type="button" onClick={() => {
              const container = contentRef.current
              const target = document.getElementById(id)
              if (!container || !target) return
              container.scrollTop += target.getBoundingClientRect().top - container.getBoundingClientRect().top
            }}>
              {t(labelKey)}
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
          <h2>{t('settings.section.theme')}</h2>
          <label>
            <span>{t('settings.language')}</span>
            <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
              {localeOptions.map((option) => (
                <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('settings.colorMode')}</span>
            <select
              value={themeMode()}
              onChange={(event) => onChange((draft) => setThemeMode(draft, event.target.value as ThemeMode))}
            >
              <option value="system">{t('settings.colorMode.system')}</option>
              <option value="light">{t('settings.colorMode.light')}</option>
              <option value="dark">{t('settings.colorMode.dark')}</option>
            </select>
          </label>
          <label>
            <span>{t('settings.themeStyle')}</span>
            <select
              value={themeStyle()}
              onChange={(event) => onChange((draft) => setThemeStyle(draft, event.target.value as ThemeStyle))}
            >
              <option value="reading">{t('settings.themeStyle.reading')}</option>
              <option value="default">{t('settings.themeStyle.default')}</option>
            </select>
          </label>
          <label>
            <span>{t('settings.englishFont')}</span>
            <select
              value={themeEnglishFont()}
              onChange={(event) => onChange((draft) => setThemeEnglishFont(draft, event.target.value as EnglishFont))}
            >
              {englishFontOptions.map((font) => (
                <option key={font.value} value={font.value}>{t(font.labelKey)}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('settings.chineseFont')}</span>
            <select
              value={themeChineseFont()}
              onChange={(event) => onChange((draft) => setThemeChineseFont(draft, event.target.value as ChineseFont))}
            >
              {chineseFontOptions.map((font) => (
                <option key={font.value} value={font.value}>{t(font.labelKey)}</option>
              ))}
            </select>
          </label>
        </section>
        <section id="settings-shortcuts">
          <h2>{t('settings.section.shortcuts')}</h2>
          {([
            ['toggleLeft', 'settings.shortcut.directory'],
            ['toggleRight', 'settings.shortcut.reader'],
            ['openSettings', 'settings.shortcut.settings'],
            ['toggleTheme', 'settings.shortcut.toggleTheme']
          ] as const satisfies readonly [ShortcutAction, MessageKey][]).map(([key, label]) => (
            <label key={key}>
              <span>{t(label)}</span>
              <input
                readOnly
                value={shortcutValue(config, key)}
                onFocus={(event) => event.currentTarget.select()}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    onChange((draft) => setShortcut(draft, key, ''))
                    event.currentTarget.blur()
                    return
                  }
                  const shortcut = shortcutFromEvent(event.nativeEvent)
                  if (!shortcut) return
                  event.preventDefault()
                  onChange((draft) => setShortcut(draft, key, shortcut))
                  event.currentTarget.blur()
                }}
              />
            </label>
          ))}
          <label>
            <span>{t('settings.askSubmitShortcut')}</span>
            <select
              value={submitShortcut}
              onChange={(event) => {
                const value = event.target.value as AskSubmitShortcut
                setAskSubmitShortcut(value)
                setSubmitShortcutState(value)
              }}
            >
              <option value="enter">{t('settings.askSubmitShortcut.enter')}</option>
              <option value="ctrl-enter">{t('settings.askSubmitShortcut.ctrlEnter')}</option>
            </select>
          </label>
        </section>
        <section id="settings-context">
          <h2>{t('settings.section.context')}</h2>
          <label>
            <span>{t('settings.contextMode')}</span>
            <select
              value={config.context.defaultMode}
              onChange={(event) => onChange((draft) => ({
                ...draft,
                context: { ...draft.context, defaultMode: event.target.value as AppConfig['context']['defaultMode'] }
              }))}
            >
              {allowedContextModesForNextAsk().map((mode) => (
                <option key={mode} value={mode}>{t(contextLabelKeys[mode])}</option>
              ))}
            </select>
          </label>
          <label>
            <span>{t('settings.viewportBlocks')}</span>
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
            <small>{t('settings.viewportBlocksValue', { count: config.context.viewportRangeBlocks })}</small>
          </label>
          <label className="settings-textarea">
            <span>{t('settings.learningPrompt')}</span>
            <textarea
              ref={fitTextarea}
              rows={1}
              value={config.learning.prompt}
              placeholder={t('settings.learningPromptPlaceholder')}
              onInput={(event) => fitTextarea(event.currentTarget)}
              onChange={(event) => onChange((draft) => ({
                ...draft,
                learning: { ...draft.learning, prompt: event.target.value }
              }))}
            />
          </label>
        </section>
        <section id="settings-repository">
          <h2>{t('settings.section.repository')}</h2>
          <label>
            <span>{t('settings.repositoryMode')}</span>
            <input readOnly value={binding?.activeSourceMode ?? config.repository.sourceMode} />
          </label>
          <label>
            <span>{t('settings.repositorySource')}</span>
            <input readOnly value={binding?.sourceLabel ?? config.repository.mountedVaultPath ?? ''} />
          </label>
        </section>
        <section id="settings-templates" className="settings-wide">
          <h2>{t('settings.section.templates')}</h2>
          <div className="template-list">
            {templates.map((template) => {
              const locked = isCustomAskTemplate(template) || isNoteTemplate(template)
              return (
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
                <input type="checkbox" checked={template.isEnabled} aria-label={t('common.enable')} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, isEnabled: event.target.checked } : item) }))} />
                <input className="template-color" type="color" value={template.color} aria-label={t('common.color')} disabled={locked} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, color: event.target.value } : item) }))} />
                <input value={template.title} readOnly={locked} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, title: event.target.value } : item) }))} />
                <input value={template.body} readOnly={locked} onChange={(event) => onChange((draft) => ({ ...draft, templates: draft.templates.map((item) => item.id === template.id ? { ...item, body: event.target.value } : item) }))} />
                <button className="template-delete" type="button" aria-label={t('common.delete')} disabled={locked} onClick={() => onChange((draft) => ({ ...draft, templates: draft.templates.filter((item) => item.id !== template.id) }))}>
                  <Icon name="close" />
                </button>
              </div>
              )
            })}
            <button className="template-add" type="button" aria-label={t('common.add')} onClick={() => onChange((draft) => ({
              ...draft,
              templates: [
                ...draft.templates,
                {
                  id: createId('template'),
                  title: t('settings.templateNewTitle'),
                  body: t('settings.templateNewBody'),
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
