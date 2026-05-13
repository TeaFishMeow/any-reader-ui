import { useEffect, useRef, useState, type ReactNode } from 'react'
import { clampWidgetSize, normalizeCanvasViewport } from '../lib/app-helpers'
import {
  contextModeLabelKey,
  requestStateLabelKey,
  resolveQaRecordDisplayTitle
} from '../i18n/messages'
import { useI18n } from '../i18n/useI18n'
import { getQaRecordAnswerPreviewMarkdown, useQaRecordElapsedLabel } from '../lib/qa-record-preview'
import { MarkdownSurface, type MarkdownSurfaceBlock } from './MarkdownSurface'
import type {
  AppConfig,
  AskSelection,
  CanvasState,
  CanvasViewportSize,
  DocumentNode,
  QARecord,
  WidgetState
} from '../types/domain'

interface CanvasPaneProps {
  canvas: CanvasState
  qaRecords: QARecord[]
  config: AppConfig
  documents: DocumentNode[]
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
  onCanvasChange: React.Dispatch<React.SetStateAction<CanvasState | null>>
  onWidgetFocus: (widgetId: string) => void
  onWidgetChange: (widgetId: string, updater: (widget: WidgetState) => WidgetState) => void
  onWidgetClose: (widgetId: string) => void
  onAsk: (selection: AskSelection) => void
  onOpenContext: (widgetId: string) => void
  onSubmitCustom: (widgetId: string, draftPrompt: string) => Promise<void>
  onOpenRecord: (recordId: string) => void
  onOpenGroup: (recordIds: string[], point: { x: number; y: number }) => void
  onDeleteRecord: (recordId: string) => Promise<void>
  onOpenDocument: (documentId: string) => void
  onViewportSizeChange: (size: CanvasViewportSize) => void
}

type ResizeHandle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw'

const NOOP_ASK = (_selection: AskSelection) => undefined
const NOOP_OPEN_RECORD = (_recordId: string) => undefined
const NOOP_OPEN_GROUP = (_recordIds: string[], _point: { x: number; y: number }) => undefined

interface WidgetActionButtonProps {
  label: string
  onClick: () => void
  tone?: 'default' | 'danger'
  children: ReactNode
}

function WidgetActionButton({ label, onClick, tone = 'default', children }: WidgetActionButtonProps) {
  return (
    <button
      className={`widget-action-button ${tone === 'danger' ? 'danger' : ''}`}
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <span className="widget-action-icon" aria-hidden="true">
        {children}
      </span>
    </button>
  )
}

interface WidgetDetailsToggleProps {
  open: boolean
  onToggle: () => void
}

function WidgetDetailsToggle({ open, onToggle }: WidgetDetailsToggleProps) {
  const { t } = useI18n()
  return (
    <div className="widget-detail-strip">
      <button
        className="widget-detail-toggle"
        type="button"
        aria-label={open ? t('canvas.action.hideDetails') : t('canvas.action.showDetails')}
        aria-expanded={open}
        onClick={onToggle}
      >
        <span>{t('canvas.label.details')}</span>
        <span className="widget-detail-toggle-icon" aria-hidden="true">
          {open ? <CollapseIcon /> : <ExpandIcon />}
        </span>
      </button>
    </div>
  )
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M4 10 8 6 12 10" />
    </svg>
  )
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M4 6 8 10 12 6" />
    </svg>
  )
}

function DeleteIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M3.5 4.5h9" />
      <path d="M6.5 2.75h3" />
      <path d="M5 4.5v7.25c0 .4.35.75.75.75h4.5c.4 0 .75-.35.75-.75V4.5" />
      <path d="M6.75 6.5v4" />
      <path d="M9.25 6.5v4" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 16 16" fill="none" focusable="false">
      <path d="M4.5 4.5 11.5 11.5" />
      <path d="M11.5 4.5 4.5 11.5" />
    </svg>
  )
}

function getRecordSelectedText(record: QARecord | null, fallback?: string) {
  return record?.anchor.mathDisplayText ?? record?.selectedText ?? fallback ?? '...'
}

function buildDetailBlocks(args: {
  selectedTitle: string
  questionTitle: string
  selectedText: string
  contextTitle: string
  contextMarkdown: string
  questionMarkdown: string
}): MarkdownSurfaceBlock[] {
  return [
    {
      path: 'selected-text',
      title: args.selectedTitle,
      markdown: `> ${args.selectedText || '...'}`
    },
    {
      path: 'context-preview',
      title: args.contextTitle,
      markdown: args.contextMarkdown || '...'
    },
    {
      path: 'question',
      title: args.questionTitle,
      markdown: args.questionMarkdown || '...'
    }
  ]
}

export function CanvasPane({
  canvas,
  qaRecords,
  config,
  documents,
  mountedVaultPath,
  remoteLibraryId,
  remoteRevisionId,
  onCanvasChange,
  onWidgetFocus,
  onWidgetChange,
  onWidgetClose,
  onAsk,
  onOpenContext,
  onSubmitCustom,
  onOpenRecord,
  onOpenGroup,
  onDeleteRecord,
  onOpenDocument,
  onViewportSizeChange
}: CanvasPaneProps) {
  const { t } = useI18n()
  const boardRef = useRef<HTMLDivElement | null>(null)
  const viewport = normalizeCanvasViewport(canvas.viewport)

  useEffect(() => {
    const board = boardRef.current
    if (!board) {
      return
    }

    const measure = () => {
      onViewportSizeChange({
        width: board.clientWidth,
        height: board.clientHeight
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(board)

    return () => {
      observer.disconnect()
    }
  }, [onViewportSizeChange])

  function patchCanvas(updater: (draft: CanvasState) => CanvasState) {
    onCanvasChange((previous) => (previous ? updater(previous) : previous))
  }

  function getWidgetRecord(widget: WidgetState) {
    return widget.type === 'ask'
      ? qaRecords.find((record) => record.id === widget.props.linkedQaRecordId) ?? null
      : qaRecords.find((record) => record.id === widget.props.qaRecordId) ?? null
  }

  function getWidgetTitle(widget: WidgetState, qaRecord: QARecord | null) {
    if (widget.type === 'qa-record') {
      return resolveQaRecordDisplayTitle({
        record: qaRecord,
        templates: config.templates,
        t,
        fallbackKey: 'canvas.title.qaRecord'
      })
    }

    if (widget.props.mode === 'custom' && !qaRecord) {
      return t('shared.customAsk')
    }

    return resolveQaRecordDisplayTitle({
      record: qaRecord,
      templates: config.templates,
      t,
      fallbackKey: 'canvas.title.ask'
    })
  }

  function renderWidgetBody(widget: WidgetState, qaRecord: QARecord | null) {
    if (widget.type === 'ask') {
      return (
        <AskWidgetView
          widget={widget}
          qaRecord={qaRecord}
          config={config}
          documents={documents}
          mountedVaultPath={mountedVaultPath}
          remoteLibraryId={remoteLibraryId}
          remoteRevisionId={remoteRevisionId}
          onOpenContext={() => onOpenContext(widget.id)}
          onSubmit={(draftPrompt) => onSubmitCustom(widget.id, draftPrompt)}
          onOpenDocument={onOpenDocument}
        />
      )
    }

    if (qaRecord) {
      return (
        <QARecordWidgetView
          record={qaRecord}
          widgetId={widget.id}
          qaRecords={qaRecords}
          config={config}
          documents={documents}
          mountedVaultPath={mountedVaultPath}
          remoteLibraryId={remoteLibraryId}
          remoteRevisionId={remoteRevisionId}
          onAsk={onAsk}
          onOpenRecord={onOpenRecord}
          onOpenGroup={onOpenGroup}
          onOpenDocument={onOpenDocument}
        />
      )
    }

    return <div className="widget-empty">{t('canvas.empty.recordMissing')}</div>
  }

  function lockDocumentInteraction(cursor: string) {
    const previousCursor = document.body.style.cursor
    const previousUserSelect = document.body.style.userSelect
    document.body.style.cursor = cursor
    document.body.style.userSelect = 'none'

    return () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousUserSelect
    }
  }

  function beginPan(event: React.PointerEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest('.canvas-widget, [data-no-canvas-pan="true"]')) {
      return
    }

    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const originX = viewport.x
    const originY = viewport.y
    const unlock = lockDocumentInteraction('grabbing')
    const pointerTarget = event.currentTarget

    const move = (moveEvent: PointerEvent) => {
      patchCanvas((draft) => ({
        ...draft,
        viewport: {
          ...draft.viewport,
          x: originX + (moveEvent.clientX - startX),
          y: originY + (moveEvent.clientY - startY)
        },
        updatedAt: new Date().toISOString()
      }))
    }

    const cleanup = () => {
      if (pointerTarget.hasPointerCapture(event.pointerId)) {
        pointerTarget.releasePointerCapture(event.pointerId)
      }
      unlock()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  function beginWidgetDrag(event: React.PointerEvent<HTMLDivElement>, widgetId: string) {
    if ((event.target as HTMLElement).closest('[data-no-widget-drag="true"]')) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    onWidgetFocus(widgetId)
    const widget = canvas.widgetStates.find((candidate) => candidate.id === widgetId)
    if (!widget) {
      return
    }

    const startX = event.clientX
    const startY = event.clientY
    const origin = widget.position
    const zoomRatio = viewport.zoom
    const unlock = lockDocumentInteraction('grabbing')
    const pointerTarget = event.currentTarget

    const move = (moveEvent: PointerEvent) => {
      onWidgetChange(widgetId, (candidate) => ({
        ...candidate,
        position: {
          x: origin.x + (moveEvent.clientX - startX) / zoomRatio,
          y: origin.y + (moveEvent.clientY - startY) / zoomRatio
        }
      }))
    }

    const cleanup = () => {
      if (pointerTarget.hasPointerCapture(event.pointerId)) {
        pointerTarget.releasePointerCapture(event.pointerId)
      }
      unlock()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  function beginWidgetResize(event: React.PointerEvent<HTMLButtonElement>, widgetId: string, handle: ResizeHandle) {
    event.preventDefault()
    event.stopPropagation()
    onWidgetFocus(widgetId)
    const widget = canvas.widgetStates.find((candidate) => candidate.id === widgetId)
    if (!widget || widget.isCollapsed) {
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    const startX = event.clientX
    const startY = event.clientY
    const originSize = widget.size
    const originPosition = widget.position
    const zoomRatio = viewport.zoom
    const resizeCursor =
      handle === 'e' || handle === 'w'
        ? 'ew-resize'
        : handle === 'n' || handle === 's'
          ? 'ns-resize'
          : handle === 'ne' || handle === 'sw'
            ? 'nesw-resize'
            : 'nwse-resize'
    const unlock = lockDocumentInteraction(resizeCursor)
    const pointerTarget = event.currentTarget

    const move = (moveEvent: PointerEvent) => {
      const deltaX = (moveEvent.clientX - startX) / zoomRatio
      const deltaY = (moveEvent.clientY - startY) / zoomRatio
      const movesWest = handle.includes('w')
      const movesEast = handle.includes('e')
      const movesNorth = handle.includes('n')
      const movesSouth = handle.includes('s')
      const nextSize = clampWidgetSize({
        w: movesWest ? originSize.w - deltaX : movesEast ? originSize.w + deltaX : originSize.w,
        h: movesNorth ? originSize.h - deltaY : movesSouth ? originSize.h + deltaY : originSize.h
      })
      onWidgetChange(widgetId, (candidate) => ({
        ...candidate,
        position: {
          x: movesWest ? originPosition.x + originSize.w - nextSize.w : originPosition.x,
          y: movesNorth ? originPosition.y + originSize.h - nextSize.h : originPosition.y
        },
        size: nextSize
      }))
    }

    const cleanup = () => {
      if (pointerTarget.hasPointerCapture(event.pointerId)) {
        pointerTarget.releasePointerCapture(event.pointerId)
      }
      unlock()
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', cleanup)
      window.removeEventListener('pointercancel', cleanup)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', cleanup)
    window.addEventListener('pointercancel', cleanup)
  }

  return (
    <div className="canvas-shell">
      <div ref={boardRef} className="canvas-board" onPointerDown={beginPan}>
        {canvas.widgetStates.length === 0 ? (
          <div className="canvas-empty-state" aria-live="polite">
            <strong>{t('canvas.empty.noWidgetsTitle')}</strong>
            <p>{t('canvas.empty.noWidgetsBody')}</p>
          </div>
        ) : null}
        <div
          className="canvas-scene"
          style={{
            transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`
          }}
        >
          {canvas.widgetStates.map((widget) => {
            const qaRecord = getWidgetRecord(widget)

            return (
              <div
                key={widget.id}
                className={`canvas-widget ${widget.type}${widget.isCollapsed ? ' collapsed' : ''}`}
                style={{
                  left: widget.position.x,
                  top: widget.position.y,
                  width: widget.size.w,
                  height: widget.isCollapsed ? undefined : widget.size.h,
                  zIndex: widget.zIndex
                }}
                onMouseDown={() => onWidgetFocus(widget.id)}
              >
                <div className="widget-header" onPointerDown={(event) => beginWidgetDrag(event, widget.id)}>
                  <div className="widget-heading">
                    <strong>{getWidgetTitle(widget, qaRecord)}</strong>
                  </div>
                  <div className="widget-actions" data-no-widget-drag="true">
                    <WidgetActionButton
                      label={widget.isCollapsed ? t('canvas.action.expandWidget') : t('canvas.action.collapseWidget')}
                      onClick={() =>
                        onWidgetChange(widget.id, (candidate) => ({
                          ...candidate,
                          isCollapsed: !candidate.isCollapsed
                        }))
                      }
                    >
                      {widget.isCollapsed ? <ExpandIcon /> : <CollapseIcon />}
                    </WidgetActionButton>
                    {widget.type === 'qa-record' && qaRecord ? (
                      <WidgetActionButton
                        label={t('canvas.action.deleteRecord')}
                        tone="danger"
                        onClick={() => void onDeleteRecord(qaRecord.id)}
                      >
                        <DeleteIcon />
                      </WidgetActionButton>
                    ) : null}
                    <WidgetActionButton label={t('canvas.action.closeWidget')} onClick={() => onWidgetClose(widget.id)}>
                      <CloseIcon />
                    </WidgetActionButton>
                  </div>
                </div>

                {!widget.isCollapsed ? (
                  <div className="widget-body">{renderWidgetBody(widget, qaRecord)}</div>
                ) : null}
                {!widget.isCollapsed ? (
                  <>
                    {(['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as ResizeHandle[]).map((handle) => (
                      <button
                        key={handle}
                        type="button"
                        className={`widget-resize-handle widget-resize-handle--${handle}`}
                        data-no-canvas-pan="true"
                        data-no-widget-drag="true"
                        aria-label={t('canvas.action.resizeWidget')}
                        onPointerDown={(event) => beginWidgetResize(event, widget.id, handle)}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

interface AskWidgetViewProps {
  widget: Extract<WidgetState, { type: 'ask' }>
  qaRecord: QARecord | null
  config: AppConfig
  documents: DocumentNode[]
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
  onOpenContext: () => void
  onSubmit: (draftPrompt: string) => Promise<void>
  onOpenDocument: (documentId: string) => void
}

function AskWidgetView({
  widget,
  qaRecord,
  config,
  documents,
  mountedVaultPath,
  remoteLibraryId,
  remoteRevisionId,
  onOpenContext,
  onSubmit,
  onOpenDocument
}: AskWidgetViewProps) {
  const { t } = useI18n()
  const [draftPrompt, setDraftPrompt] = useState(widget.props.draftPrompt ?? '')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const preview = widget.props.contextPreview
  const currentContextMode = preview?.readingContextMode ?? qaRecord?.readingContextMode
  const sourceDocument = qaRecord?.sourceDocumentId
    ? documents.find((document) => document.id === qaRecord.sourceDocumentId) ?? null
    : null
  const elapsedLabel = useQaRecordElapsedLabel(qaRecord)
  const answerMarkdown = getQaRecordAnswerPreviewMarkdown(qaRecord, elapsedLabel, {
    answerPending: t('canvas.label.answerPending')
  })
  const detailBlocks = buildDetailBlocks({
    selectedTitle: t('canvas.label.selectedText'),
    questionTitle: t('canvas.label.question'),
    selectedText: getRecordSelectedText(qaRecord, preview?.selectedText),
    contextTitle: currentContextMode
      ? `${t('canvas.label.contextPreview')} - ${t(contextModeLabelKey(currentContextMode))}`
      : t('canvas.label.contextPreview'),
    contextMarkdown: preview?.readingContext || qaRecord?.readingContextSnapshot || t('shared.notAvailableYet'),
    questionMarkdown: qaRecord?.questionText || t('canvas.label.templateAsk')
  })
  const answerBlocks: MarkdownSurfaceBlock[] = [
    {
      path: 'answer',
      title: t('canvas.label.answer'),
      markdown: answerMarkdown
    }
  ]

  useEffect(() => {
    setDraftPrompt(widget.props.draftPrompt ?? '')
  }, [widget.props.draftPrompt])

  useEffect(() => {
    setDetailsOpen(false)
  }, [widget.id, qaRecord?.id])

  return (
    <div className="ask-widget">
      {widget.props.mode === 'custom' && widget.props.requestState === 'editing' ? (
        <>
          <div className="widget-plain-block">
            <span>{t('canvas.label.selectedText')}</span>
            <strong>{getRecordSelectedText(qaRecord, preview?.selectedText)}</strong>
          </div>

          <div className="widget-plain-block">
            <span>
              {currentContextMode
                ? `${t('canvas.label.contextPreview')} - ${t(contextModeLabelKey(currentContextMode))}`
                : t('canvas.label.contextPreview')}
            </span>
            <p>{preview?.readingContext || qaRecord?.readingContextSnapshot || t('shared.notAvailableYet')}</p>
          </div>

          <div className="custom-ask-editor">
            <button className="ghost-button small" onClick={onOpenContext}>
              {t('canvas.button.adjustAskContext')}
            </button>
            <textarea
              value={draftPrompt}
              onChange={(event) => setDraftPrompt(event.target.value)}
              placeholder={t('canvas.placeholder.prompt')}
            />
            <button
              className="primary-button"
              disabled={!draftPrompt.trim()}
              onClick={() => void onSubmit(draftPrompt.trim())}
            >
              {t('canvas.button.submit')}
            </button>
          </div>
        </>
      ) : (
        <>
          <WidgetDetailsToggle open={detailsOpen} onToggle={() => setDetailsOpen((previous) => !previous)} />
          {detailsOpen ? (
            <div className="widget-detail-panel">
              <MarkdownSurface
                markdown=""
                qaRecords={[]}
                config={config}
                surface="reader"
                fontScope="widget"
                documentId={sourceDocument?.id}
                documentPath={sourceDocument?.path}
                documents={documents}
                mountedVaultPath={mountedVaultPath}
                remoteLibraryId={remoteLibraryId}
                remoteRevisionId={remoteRevisionId}
                surfaceTitle={t('canvas.title.askDetails')}
                semanticBlocks={detailBlocks}
                allowAsk={false}
                showAnnotations={false}
                onAsk={NOOP_ASK}
                onOpenRecord={NOOP_OPEN_RECORD}
                onOpenGroup={NOOP_OPEN_GROUP}
                onOpenDocument={onOpenDocument}
              />
            </div>
          ) : null}
          <div className="widget-answer-panel">
            <div className="streaming-state">
              <span>{t(requestStateLabelKey(widget.props.requestState))}</span>
            </div>
            <div className="streaming-preview">
              <MarkdownSurface
                markdown=""
                qaRecords={[]}
                config={config}
                surface="reader"
                fontScope="widget"
                documentId={sourceDocument?.id}
                documentPath={sourceDocument?.path}
                documents={documents}
                mountedVaultPath={mountedVaultPath}
                remoteLibraryId={remoteLibraryId}
                remoteRevisionId={remoteRevisionId}
                surfaceTitle={qaRecord?.questionText ?? t('canvas.title.answerPreview')}
                semanticBlocks={answerBlocks}
                allowAsk={false}
                showAnnotations={false}
                onAsk={NOOP_ASK}
                onOpenRecord={NOOP_OPEN_RECORD}
                onOpenGroup={NOOP_OPEN_GROUP}
                onOpenDocument={onOpenDocument}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

interface QARecordWidgetViewProps {
  record: QARecord
  widgetId: string
  qaRecords: QARecord[]
  config: AppConfig
  documents: DocumentNode[]
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
  onAsk: (selection: AskSelection) => void
  onOpenRecord: (recordId: string) => void
  onOpenGroup: (recordIds: string[], point: { x: number; y: number }) => void
  onOpenDocument: (documentId: string) => void
}

function QARecordWidgetView({
  record,
  widgetId,
  qaRecords,
  config,
  documents,
  mountedVaultPath,
  remoteLibraryId,
  remoteRevisionId,
  onAsk,
  onOpenRecord,
  onOpenGroup,
  onOpenDocument
}: QARecordWidgetViewProps) {
  const { t } = useI18n()
  const sourceDocument = record.sourceDocumentId
    ? documents.find((document) => document.id === record.sourceDocumentId) ?? null
    : null
  const [detailsOpen, setDetailsOpen] = useState(false)
  const elapsedLabel = useQaRecordElapsedLabel(record)
  const detailBlocks = buildDetailBlocks({
    selectedTitle: t('canvas.label.selectedText'),
    questionTitle: t('canvas.label.question'),
    selectedText: getRecordSelectedText(record),
    contextTitle: `${t('canvas.label.contextPreview')} - ${t(contextModeLabelKey(record.readingContextMode))}`,
    contextMarkdown: record.readingContextSnapshot || t('shared.notAvailableYet'),
    questionMarkdown: record.questionText || t('canvas.label.questionPending')
  })
  const answerBlocks: MarkdownSurfaceBlock[] = [
    {
      path: 'answer',
      title: t('canvas.label.answer'),
      markdown: getQaRecordAnswerPreviewMarkdown(record, elapsedLabel, {
        answerPending: t('canvas.label.answerPending')
      })
    }
  ]

  useEffect(() => {
    setDetailsOpen(false)
  }, [record.id])

  return (
    <div className="qa-widget">
      <WidgetDetailsToggle open={detailsOpen} onToggle={() => setDetailsOpen((previous) => !previous)} />
      {detailsOpen ? (
        <div className="widget-detail-panel">
          <MarkdownSurface
            markdown=""
            qaRecords={qaRecords}
            config={config}
            surface="widget"
            documentId={sourceDocument?.id}
            documentPath={sourceDocument?.path}
            documents={documents}
            mountedVaultPath={mountedVaultPath}
            remoteLibraryId={remoteLibraryId}
            remoteRevisionId={remoteRevisionId}
            widgetId={widgetId}
            surfaceTitle={`${resolveQaRecordDisplayTitle({
              record,
              templates: config.templates,
              t,
              fallbackKey: 'canvas.title.qaRecord'
            })} ${t('canvas.title.detailsSuffix')}`}
            sourceQaRecordId={record.id}
            semanticBlocks={detailBlocks}
            onAsk={onAsk}
            onOpenRecord={onOpenRecord}
            onOpenGroup={onOpenGroup}
            onOpenDocument={onOpenDocument}
          />
        </div>
      ) : null}
      <MarkdownSurface
        markdown=""
        qaRecords={qaRecords}
        config={config}
        surface="widget"
        documentId={sourceDocument?.id}
        documentPath={sourceDocument?.path}
        documents={documents}
        mountedVaultPath={mountedVaultPath}
        remoteLibraryId={remoteLibraryId}
        remoteRevisionId={remoteRevisionId}
        widgetId={widgetId}
        surfaceTitle={resolveQaRecordDisplayTitle({
          record,
          templates: config.templates,
          t,
          fallbackKey: 'canvas.title.qaRecord'
        })}
        sourceQaRecordId={record.id}
        semanticBlocks={answerBlocks}
        onAsk={onAsk}
        onOpenRecord={onOpenRecord}
        onOpenGroup={onOpenGroup}
        onOpenDocument={onOpenDocument}
      />
    </div>
  )
}
