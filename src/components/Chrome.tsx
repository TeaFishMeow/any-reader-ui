import { useEffect, useRef, useState } from 'react'
import { LocaleSwitcher } from './LocaleSwitcher'
import { ThemeSwitcher } from './ThemeSwitcher'
import { clamp, createId, makeSummary, truncateText } from '../lib/text'
import { sortTemplates } from '../lib/app-helpers'
import { contextModeLabelKey, resolveQaRecordDisplayTitle } from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { useAuthSession } from '../lib/auth-session'
import { buildLoginPath } from '../lib/web-routing'
import type {
  PendingAskSession,
  PromptTemplate,
  QARecord,
  ReadingContextMode,
  RepositoryBinding
} from '../types/domain'

export interface AskMenuState {
  session: PendingAskSession
  hoveredTemplateId: string | null
}

interface AskMenuProps {
  askMenu: AskMenuState
  templates: PromptTemplate[]
  onHoverTemplate: (templateId: string) => void
  onSelectTemplate: (template: PromptTemplate) => void
  onCustomAsk: () => void
  showQuickErrata?: boolean
  onQuickErrata?: () => void
  onClose: () => void
  onOpenTemplates: () => void
}

export function AskMenu({
  askMenu,
  templates,
  onHoverTemplate,
  onSelectTemplate,
  onCustomAsk,
  showQuickErrata = false,
  onQuickErrata,
  onClose,
  onOpenTemplates
}: AskMenuProps) {
  const { t } = useI18n()
  const menuRef = useRef<HTMLDivElement | null>(null)
  const hoveredTemplate =
    templates.find((template) => template.id === askMenu.hoveredTemplateId) ?? templates[0] ?? null

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('mousedown', handleClick)
    return () => window.removeEventListener('mousedown', handleClick)
  }, [onClose])

  return (
    <div
      ref={menuRef}
      className="ask-menu"
      style={{
        left: clamp(askMenu.session.action.menuPoint.x, 12, window.innerWidth - 440),
        top: clamp(askMenu.session.action.menuPoint.y, 12, window.innerHeight - 280)
      }}
    >
      <div className="ask-menu-list">
        <button className="custom-ask-button" onClick={onCustomAsk}>
          {t('chrome.askMenu.customAsk')}
        </button>
        {showQuickErrata ? (
          <button className="ask-menu-secondary-button" onClick={() => onQuickErrata?.()}>
            {t('app.quickErrata.menuAction')}
          </button>
        ) : null}
        {templates.map((template) => (
          <button
            key={template.id}
            className={`template-button ${template.id === askMenu.hoveredTemplateId ? 'hovered' : ''}`}
            style={{ borderColor: `${template.color}55`, color: template.color }}
            onMouseEnter={() => onHoverTemplate(template.id)}
            onFocus={() => onHoverTemplate(template.id)}
            onClick={() => onSelectTemplate(template)}
          >
            {template.title}
          </button>
        ))}
      </div>

      <div className="ask-menu-preview">
        <span className="preview-label">{t('chrome.askMenu.previewLabel')}</span>
        <strong>{hoveredTemplate?.title ?? t('chrome.askMenu.templateFallback')}</strong>
        <p>{hoveredTemplate?.body ?? t('chrome.askMenu.previewFallback')}</p>
        <div className="selection-preview">
          <span>{t('chrome.askMenu.selectedText')}</span>
          <p>{truncateText(askMenu.session.action.selection.text, 120)}</p>
        </div>
        <div className="selection-preview">
          <span>{t('chrome.askMenu.contextMode')}</span>
          <p>{t(contextModeLabelKey(askMenu.session.action.contextMode ?? 'section'))}</p>
        </div>
        <button className="icon-button small gear-button" onClick={onOpenTemplates}>
          ⚙
        </button>
      </div>
    </div>
  )
}

interface GroupChooserProps {
  point: { x: number; y: number }
  records: QARecord[]
  templates: PromptTemplate[]
  onOpenRecord: (recordId: string) => void
  onClose: () => void
}

export function GroupChooser({ point, records, templates, onOpenRecord, onClose }: GroupChooserProps) {
  const { t } = useI18n()
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }

    window.addEventListener('mousedown', onPointerDown)
    return () => window.removeEventListener('mousedown', onPointerDown)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="group-chooser"
      style={{
        left: clamp(point.x, 20, window.innerWidth - 280),
        top: clamp(point.y, 20, window.innerHeight - 260)
      }}
    >
      <strong>{t('chrome.groupChooser.title')}</strong>
      <div className="group-chooser-list">
        {records.map((record) => (
          <button key={record.id} className="group-record" onClick={() => onOpenRecord(record.id)}>
            <span style={{ background: record.visualStyle.color }} />
            <div>
              <strong>
                {resolveQaRecordDisplayTitle({
                  record,
                  templates,
                  t,
                  fallbackKey: 'canvas.title.qaRecord'
                })}
              </strong>
              <p>{makeSummary(record.answerMarkdown)}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

interface TemplateSettingsModalProps {
  templates: PromptTemplate[]
  onClose: () => void
  onChange: (templates: PromptTemplate[]) => void
}

export function TemplateSettingsModal({ templates, onClose, onChange }: TemplateSettingsModalProps) {
  const { t } = useI18n()
  const [draggingTemplateId, setDraggingTemplateId] = useState<string | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  const dropIndexRef = useRef<number | null>(null)
  const pointerSortCleanupRef = useRef<(() => void) | null>(null)
  const sortedTemplates = sortTemplates(templates)

  useEffect(() => {
    return () => {
      pointerSortCleanupRef.current?.()
      pointerSortCleanupRef.current = null
      document.body.style.removeProperty('cursor')
    }
  }, [])

  function updateTemplate(templateId: string, updater: (template: PromptTemplate) => PromptTemplate) {
    onChange(templates.map((template) => (template.id === templateId ? updater(template) : template)))
  }

  function setActiveDropIndex(index: number | null) {
    dropIndexRef.current = index
    setDropIndex(index)
  }

  function clearDragState() {
    setDraggingTemplateId(null)
    setActiveDropIndex(null)
  }

  function reorderTemplate(templateId: string, rawDropIndex: number) {
    const sourceIndex = sortedTemplates.findIndex((template) => template.id === templateId)
    if (sourceIndex < 0) {
      return
    }

    const boundedDropIndex = Math.max(0, Math.min(rawDropIndex, sortedTemplates.length))
    const targetIndex = boundedDropIndex > sourceIndex ? boundedDropIndex - 1 : boundedDropIndex
    if (targetIndex === sourceIndex) {
      return
    }

    const nextTemplates = [...sortedTemplates]
    const [draggedTemplate] = nextTemplates.splice(sourceIndex, 1)
    nextTemplates.splice(targetIndex, 0, draggedTemplate)
    onChange(nextTemplates.map((template, order) => ({ ...template, order })))
  }

  function removeTemplate(templateId: string) {
    onChange(
      sortedTemplates.filter((template) => template.id !== templateId).map((template, order) => ({
        ...template,
        order
      }))
    )
    setExpandedTemplateId((current) => (current === templateId ? null : current))
    if (draggingTemplateId === templateId) {
      clearDragState()
    }
  }

  function resolveDropIndexFromPointer(clientY: number) {
    const listNode = listRef.current
    if (!listNode) {
      return null
    }

    const cards = Array.from(listNode.querySelectorAll<HTMLElement>('.template-editor-card'))
    if (!cards.length) {
      return 0
    }

    for (let index = 0; index < cards.length; index += 1) {
      const rect = cards[index].getBoundingClientRect()
      if (clientY < rect.top + rect.height / 2) {
        return index
      }
    }

    return cards.length
  }

  function beginPointerSort(templateId: string, index: number) {
    return (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      event.stopPropagation()
      pointerSortCleanupRef.current?.()

      const pointerId = event.pointerId
      const handle = event.currentTarget

      setDraggingTemplateId(templateId)
      setActiveDropIndex(index)
      document.body.style.cursor = 'grabbing'

      const updateFromPointer = (clientY: number) => {
        const nextDropIndex = resolveDropIndexFromPointer(clientY)
        if (nextDropIndex !== null && nextDropIndex !== dropIndexRef.current) {
          setActiveDropIndex(nextDropIndex)
        }
      }

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) {
          return
        }
        updateFromPointer(moveEvent.clientY)
      }

      const handlePointerUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) {
          return
        }
        finish(true)
      }

      const handlePointerCancel = (cancelEvent: PointerEvent) => {
        if (cancelEvent.pointerId !== pointerId) {
          return
        }
        finish(false)
      }

      const teardown = () => {
        window.removeEventListener('pointermove', handlePointerMove)
        window.removeEventListener('pointerup', handlePointerUp)
        window.removeEventListener('pointercancel', handlePointerCancel)
        document.body.style.removeProperty('cursor')
        try {
          handle.releasePointerCapture(pointerId)
        } catch {
          // Ignore capture cleanup failures from browsers that never captured.
        }
        if (pointerSortCleanupRef.current === teardown) {
          pointerSortCleanupRef.current = null
        }
      }

      const finish = (commit: boolean) => {
        const finalDropIndex = dropIndexRef.current
        teardown()
        clearDragState()
        if (commit && finalDropIndex !== null) {
          reorderTemplate(templateId, finalDropIndex)
        }
      }

      window.addEventListener('pointermove', handlePointerMove)
      window.addEventListener('pointerup', handlePointerUp)
      window.addEventListener('pointercancel', handlePointerCancel)
      pointerSortCleanupRef.current = teardown

      try {
        handle.setPointerCapture(pointerId)
      } catch {
        // Browsers can reject capture on synthetic pointer streams; sorting still works via window listeners.
      }

      updateFromPointer(event.clientY)
    }
  }

  function renderDropSlot(index: number) {
    const className = [
      'template-editor-drop-slot',
      draggingTemplateId ? 'is-dragging' : '',
      dropIndex === index ? 'is-active' : ''
    ]
      .filter(Boolean)
      .join(' ')

    return (
      <div className={className} data-template-drop-index={index}>
        <span className="template-editor-drop-slot-line" aria-hidden="true" />
      </div>
    )
  }

  function addTemplate() {
    onChange([
      ...templates,
      {
        id: createId('template'),
        title: t('chrome.templateSettings.newTemplateTitle'),
        body: t('chrome.templateSettings.newTemplateBody'),
        color: '#4a5568',
        order: templates.length,
        isBuiltIn: false,
        isEnabled: true,
        scope: 'global'
      }
    ])
  }

  function summarizeTemplateBody(body: string) {
    return body.replace(/\s+/g, ' ').trim()
  }

  return (
    <ModalShell title={t('chrome.templateSettings.title')} onClose={onClose}>
      <div className="modal-toolbar">
        <button className="primary-button" onClick={addTemplate}>
          {t('chrome.templateSettings.addTemplate')}
        </button>
      </div>
      <div ref={listRef} className="template-editor-list">
        {sortedTemplates.map((template, index) => (
          <div key={template.id} className="template-editor-item">
            {renderDropSlot(index)}
            <div
              className={`template-editor-card${draggingTemplateId === template.id ? ' is-dragging' : ''}${
                expandedTemplateId === template.id ? ' is-editing' : ''
              }`}
              data-template-id={template.id}
            >
              <input
                className="template-editor-title"
                value={template.title}
                onChange={(event) =>
                  updateTemplate(template.id, (draft) => ({
                    ...draft,
                    title: event.target.value
                  }))
                }
              />
              {expandedTemplateId === template.id ? (
                <textarea
                  className="template-body-field"
                  data-template-body-textarea={template.id}
                  rows={6}
                  value={template.body}
                  autoFocus
                  onBlur={() => setExpandedTemplateId((current) => (current === template.id ? null : current))}
                  onChange={(event) =>
                    updateTemplate(template.id, (draft) => ({
                      ...draft,
                      body: event.target.value
                    }))
                  }
                />
              ) : (
                <button
                  type="button"
                  className="template-body-preview"
                  data-template-body-preview={template.id}
                  title={template.body}
                  onClick={() => setExpandedTemplateId(template.id)}
                >
                  {summarizeTemplateBody(template.body) || t('chrome.templateSettings.editBodyHint')}
                </button>
              )}
              <label className="template-editor-toggle">
                <input
                  type="checkbox"
                  checked={template.isEnabled}
                  onChange={(event) =>
                    updateTemplate(template.id, (draft) => ({
                      ...draft,
                      isEnabled: event.target.checked
                    }))
                  }
                />
                {t('chrome.templateSettings.enabled')}
              </label>
              <label className="template-editor-color-swatch">
                <span className="template-editor-color-chip" style={{ backgroundColor: template.color }} aria-hidden="true" />
                <span className="template-editor-color-value">{template.color.toUpperCase()}</span>
                <input
                  className="template-editor-color-input"
                  type="color"
                  value={template.color}
                  aria-label={t('chrome.templateSettings.chooseColor', {
                    title: template.title || t('chrome.askMenu.templateFallback')
                  })}
                  onChange={(event) =>
                    updateTemplate(template.id, (draft) => ({
                      ...draft,
                      color: event.target.value
                    }))
                  }
                />
              </label>
              <button
                type="button"
                className={`template-drag-handle${draggingTemplateId === template.id ? ' is-dragging' : ''}`}
                title={t('chrome.templateSettings.dragToReorder')}
                aria-label={t('chrome.templateSettings.dragToReorder')}
                data-template-drag-handle={template.id}
                onPointerDown={beginPointerSort(template.id, index)}
              >
                <span className="template-drag-handle-bars" aria-hidden="true">
                  <span />
                  <span />
                  <span />
                </span>
              </button>
              <button
                type="button"
                className="template-delete-button"
                title={t('chrome.templateSettings.delete', {
                  title: template.title || t('chrome.askMenu.templateFallback')
                })}
                aria-label={t('chrome.templateSettings.delete', {
                  title: template.title || t('chrome.askMenu.templateFallback')
                })}
                onClick={() => removeTemplate(template.id)}
              >
                <svg className="template-delete-button-icon" viewBox="0 0 16 16" focusable="false" aria-hidden="true">
                  <path
                    d="M3.5 4.5h9m-7.5 0V3.75c0-.69.56-1.25 1.25-1.25h3c.69 0 1.25.56 1.25 1.25v.75m-6.5 0-.4 7.2A1.5 1.5 0 0 0 5.1 13.25h5.8a1.5 1.5 0 0 0 1.5-1.55l-.4-7.2m-4.15 2v4m2.3-4v4"
                    fill="none"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="1.2"
                  />
                </svg>
              </button>
            </div>
          </div>
        ))}
        {renderDropSlot(sortedTemplates.length)}
      </div>
    </ModalShell>
  )
}

interface ContextSettingsModalProps {
  title: string
  note: string
  currentMode: ReadingContextMode
  allowedModes: ReadingContextMode[]
  viewportRangeBlocks: number
  learningPrompt: string
  previewText?: string
  selectedText?: string
  onClose: () => void
  onChangeMode: (mode: ReadingContextMode) => void
  onChangeLearningPrompt: (value: string) => void
  onChangeViewportRangeBlocks: (value: number) => void
}

export function ContextSettingsModal({
  title,
  note,
  currentMode,
  allowedModes,
  viewportRangeBlocks,
  learningPrompt,
  previewText,
  selectedText,
  onClose,
  onChangeMode,
  onChangeLearningPrompt,
  onChangeViewportRangeBlocks
}: ContextSettingsModalProps) {
  const { t } = useI18n()
  return (
    <ModalShell title={title} onClose={onClose}>
      <p className="modal-note">{note}</p>

      <div className="settings-grid">
        <label className="settings-field">
          <span>{t('chrome.contextSettings.contextMode')}</span>
          <select value={currentMode} onChange={(event) => onChangeMode(event.target.value as ReadingContextMode)}>
            {allowedModes.map((mode) => (
              <option key={mode} value={mode}>
                {t(contextModeLabelKey(mode))}
              </option>
            ))}
          </select>
        </label>

        <label className="settings-field">
          <span>{t('chrome.contextSettings.viewportBlocks')}</span>
          <input
            type="range"
            min="1"
            max="6"
            value={viewportRangeBlocks}
            onChange={(event) => onChangeViewportRangeBlocks(Number(event.target.value))}
          />
          <small>{t('chrome.contextSettings.blocks', { count: viewportRangeBlocks })}</small>
        </label>

        <label className="settings-field">
          <span>{t('chrome.contextSettings.learningPrompt')}</span>
          <textarea
            value={learningPrompt}
            placeholder={t('chrome.contextSettings.learningPromptPlaceholder')}
            onChange={(event) => onChangeLearningPrompt(event.target.value)}
          />
        </label>
      </div>

      {selectedText || previewText ? (
        <div className="template-editor-list">
          {selectedText ? (
            <div className="template-editor-card">
              <strong>{t('chrome.contextSettings.selectedText')}</strong>
              <p>{truncateText(selectedText, 180)}</p>
            </div>
          ) : null}
          {previewText ? (
            <div className="template-editor-card">
              <strong>{t('chrome.contextSettings.contextPreview')}</strong>
              <p>{truncateText(previewText, 360)}</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </ModalShell>
  )
}

interface GlobalSettingsModalProps {
  repositoryBinding: RepositoryBinding
  onClose: () => void
  onReloadWorkspace: () => Promise<void>
}

export function GlobalSettingsModal({ repositoryBinding, onClose, onReloadWorkspace }: GlobalSettingsModalProps) {
  const { t } = useI18n()
  const auth = useAuthSession()
  const currentModeLabel =
    repositoryBinding.activeSourceMode === 'remote-library'
      ? t('chrome.workspaceSettings.mode.remote')
      : repositoryBinding.activeSourceMode === 'mounted-vault'
        ? t('chrome.workspaceSettings.mode.mounted')
        : t('chrome.workspaceSettings.mode.demo')
  const currentLibraryLabel = repositoryBinding.libraryId
    ? repositoryBinding.revisionId
      ? `${repositoryBinding.libraryId} @ ${repositoryBinding.revisionId}`
      : repositoryBinding.libraryId
    : t('chrome.workspaceSettings.notBoundYet')

  async function handleSignOut() {
    try {
      await auth.signOut()
    } catch (error) {
      console.error(error)
    } finally {
      window.location.replace(buildLoginPath(`${window.location.pathname}${window.location.search}`))
    }
  }

  return (
    <ModalShell title={t('chrome.workspaceSettings.title')} onClose={onClose}>
      <div className="settings-section">
        <strong>{t('chrome.workspaceSettings.section.repository')}</strong>
        <div className="settings-list">
          <label className="settings-row">
            <span>{t('chrome.workspaceSettings.activeMode')}</span>
            <input value={currentModeLabel} readOnly />
          </label>
          <label className="settings-row">
            <span>{t('chrome.workspaceSettings.libraryBinding')}</span>
            <input value={currentLibraryLabel} readOnly />
          </label>
          <label className="settings-row">
            <span>{t('chrome.workspaceSettings.sourceLabel')}</span>
            <input value={repositoryBinding.sourceLabel ?? t('chrome.workspaceSettings.sourceLabelFallback')} readOnly />
          </label>
          <ThemeSwitcher variant="field" />
          <LocaleSwitcher variant="field" />
          {repositoryBinding.issue ? <p className="settings-warning">{repositoryBinding.issue}</p> : null}
          <p className="modal-note">{t('chrome.workspaceSettings.remoteWorkspaceNote')}</p>
          <button className="ghost-button small settings-action" onClick={() => void onReloadWorkspace()}>
            {t('chrome.workspaceSettings.reloadWorkspace')}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <strong>{t('chrome.workspaceSettings.section.llmAccess')}</strong>
        <p className="modal-note">{t('chrome.workspaceSettings.llmAccessNote')}</p>
      </div>

      <div className="settings-section">
        <strong>{t('chrome.workspaceSettings.section.account')}</strong>
        <div className="settings-list">
          <label className="settings-row">
            <span>{t('chrome.workspaceSettings.status')}</span>
            <input value={auth.status === 'signed_in' ? t('chrome.workspaceSettings.statusSignedIn') : auth.status} readOnly />
          </label>
          <label className="settings-row">
            <span>{t('chrome.workspaceSettings.email')}</span>
            <input value={auth.user?.email ?? t('shared.unknownUser')} readOnly />
          </label>
          <button className="ghost-button small settings-action" onClick={() => void handleSignOut()}>
            {t('shared.action.signOut')}
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

interface ModalShellProps {
  title: string
  children: React.ReactNode
  onClose: () => void
}

export function ModalShell({ title, children, onClose }: ModalShellProps) {
  const { t } = useI18n()
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal-card" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <span className="pane-label">{t('chrome.modal.kicker')}</span>
            <h2>{title}</h2>
          </div>
          <button className="icon-button" aria-label={t('chrome.modal.close')} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}

interface CollapsedRailProps {
  onClick: () => void
  side?: 'left' | 'right'
  ariaLabel?: string
}

export function SidebarChevron({ direction }: { direction: 'left' | 'right' }) {
  const path = direction === 'left' ? 'M7.75 2.25 4 6l3.75 3.75' : 'M4.25 2.25 8 6l-3.75 3.75'

  return (
    <svg className="sidebar-chevron" viewBox="0 0 12 12" focusable="false" aria-hidden="true">
      <path d={path} />
    </svg>
  )
}

export function CollapsedRail({ onClick, side = 'left', ariaLabel }: CollapsedRailProps) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      className={`collapsed-rail ${side}`}
      onClick={onClick}
      aria-label={ariaLabel ?? (side === 'left' ? t('app.a11y.expandLeftSidebar') : t('app.a11y.expandRightSidebar'))}
    >
      <SidebarChevron direction={side === 'left' ? 'right' : 'left'} />
    </button>
  )
}
