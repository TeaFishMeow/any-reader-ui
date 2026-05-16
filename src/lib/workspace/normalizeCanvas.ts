import type { AskAction, AskContextPreview, CanvasState, QARecord, ReadingContextMode, WidgetState } from '../../domain'
import {
  CURRENT_SELECTOR_VERSION,
  DEFAULT_WIDGET_HEIGHT,
  DEFAULT_WIDGET_WIDTH,
  buildAnchorFingerprint,
  buildFullPrompt,
  clampWidgetSize,
  inferPromptIntent
} from '../app-helpers'
import { MAIN_CANVAS_ID, defaultCanvasState } from '../defaults'
import { getMathDisplayText, getMathPromptText } from '../math-selection'
import { createId, hashString } from '../text'
import {
  asBoolean,
  asNumber,
  asOptionalNumber,
  asOptionalString,
  asString,
  isObject,
  isOneOf
} from './coerce'

const SURFACE_TYPES = ['reader', 'widget', 'sidebar'] as const
const SIDEBAR_NODE_TYPES = ['repo', 'folder', 'document'] as const
const CONTEXT_MODES = ['paragraph', 'section', 'directory', 'viewport-range', 'manual-selection', 'widget-local', 'sidebar-node'] as const
const REQUEST_STATES = ['idle', 'editing', 'pending', 'streaming', 'done', 'error'] as const
const SELECTED_TEXT_KINDS = ['plain', 'math', 'node-label', 'ai-generated', 'mixed'] as const
const WIDGET_TYPES = ['ask', 'qa-record'] as const

export function normalizeCanvas(raw: unknown): CanvasState {
  const defaults = defaultCanvasState()
  const source = isObject(raw) ? raw : {}
  const viewport = isObject(source.viewport) ? source.viewport : {}
  const selection = isObject(source.selection) ? source.selection : {}
  const widgetStates = Array.isArray(source.widgetStates)
    ? source.widgetStates.flatMap((widget, index) => normalizeWidgetState(widget, index) ?? [])
    : defaults.widgetStates
  const widgetIdSet = new Set(widgetStates.map((widget) => widget.id))
  const selectedWidgetId = selection.widgetId === null ? null : asOptionalString(selection.widgetId)

  return {
    id: asString(source.id, defaults.id),
    viewport: {
      x: asNumber(viewport.x, defaults.viewport.x),
      y: asNumber(viewport.y, defaults.viewport.y),
      zoom: asNumber(viewport.zoom, defaults.viewport.zoom)
    },
    widgetStates,
    selection: {
      widgetId: selectedWidgetId && widgetIdSet.has(selectedWidgetId) ? selectedWidgetId : defaults.selection?.widgetId ?? null
    },
    updatedAt: asString(source.updatedAt, defaults.updatedAt)
  }
}

export function reconcileCanvas(canvas: CanvasState, qaRecords: QARecord[]): CanvasState {
  const activeRecords = qaRecords.filter((record) => !record.lifecycle.isDeleted)
  const activeRecordIds = new Set(activeRecords.map((record) => record.id))
  const activeRecordMap = new Map(activeRecords.map((record) => [record.id, record]))
  const widgetStates = canvas.widgetStates.flatMap<WidgetState>((widget) => {
    if (widget.type === 'qa-record') return activeRecordIds.has(widget.props.qaRecordId) ? [widget] : []
    const linkedRecord = widget.props.linkedQaRecordId ? activeRecordMap.get(widget.props.linkedQaRecordId) ?? null : null
    if (linkedRecord) return [{ ...widget, type: 'qa-record', props: { qaRecordId: linkedRecord.id } }]
    return widget.props.pendingSession ? [widget] : []
  })
  const selectedWidgetId = canvas.selection?.widgetId ?? null
  const widgetIdSet = new Set(widgetStates.map((widget) => widget.id))
  return {
    ...canvas,
    widgetStates,
    selection: { widgetId: selectedWidgetId && widgetIdSet.has(selectedWidgetId) ? selectedWidgetId : null }
  }
}

function normalizeWidgetState(raw: unknown, index: number): WidgetState | null {
  const source = isObject(raw) ? raw : {}
  const props = isObject(source.props) ? source.props : {}
  const type = asString(source.type)
  if (!isOneOf(type, WIDGET_TYPES)) return null

  const base = {
    id: asString(source.id, createId('widget')),
    position: {
      x: asNumber(isObject(source.position) ? source.position.x : undefined, 40 + index * 18),
      y: asNumber(isObject(source.position) ? source.position.y : undefined, 40 + index * 18)
    },
    size: clampWidgetSize({
      w: asNumber(isObject(source.size) ? source.size.w : undefined, DEFAULT_WIDGET_WIDTH),
      h: asNumber(isObject(source.size) ? source.size.h : undefined, DEFAULT_WIDGET_HEIGHT)
    }),
    zIndex: asNumber(source.zIndex, index + 1),
    isCollapsed: asBoolean(source.isCollapsed, false)
  }

  if (type === 'ask') {
    return {
      ...base,
      type: 'ask',
      props: {
        mode: props.mode === 'custom' ? 'custom' : 'template',
        linkedQaRecordId: asOptionalString(props.linkedQaRecordId),
        pendingSession: normalizePendingAskSession(props.pendingSession),
        draftPrompt: asOptionalString(props.draftPrompt),
        contextPreview: normalizeContextPreview(props.contextPreview),
        requestState: isOneOf(props.requestState, REQUEST_STATES) ? props.requestState : 'idle'
      }
    }
  }

  const qaRecordId = asOptionalString(props.qaRecordId)
  return qaRecordId ? { ...base, type: 'qa-record', props: { qaRecordId } } : null
}

function normalizeContextPreview(raw: unknown): AskContextPreview | undefined {
  if (!isObject(raw)) return undefined
  return {
    statePrompt: asString(raw.statePrompt),
    readingContext: asString(raw.readingContext),
    readingContextMode: normalizeReadingContextMode(raw.readingContextMode, raw.readingContext, 'reader'),
    selectedText: asString(raw.selectedText)
  }
}

function normalizePendingAskSession(raw: unknown) {
  if (!isObject(raw)) return undefined
  const action = normalizeAskAction(raw.action)
  return action
    ? { id: asString(raw.id, createId('ask-session')), action, createdAt: asString(raw.createdAt, new Date().toISOString()) }
    : undefined
}

function normalizeAskAction(raw: unknown): AskAction | null {
  if (!isObject(raw)) return null
  const target = isObject(raw.target) ? raw.target : {}
  const selection = isObject(raw.selection) ? raw.selection : {}
  const surface = isOneOf(raw.surface, SURFACE_TYPES) ? raw.surface : 'reader'
  const selectionKind = isOneOf(selection.kind, SELECTED_TEXT_KINDS) ? selection.kind : undefined
  const selectedText = selectionKind === 'math'
    ? getMathDisplayText({
        text: asString(selection.text),
        kind: selectionKind,
        mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
        mathAnchorLatex: asOptionalString(selection.mathAnchorLatex),
        mathDisplayText: asOptionalString(selection.mathDisplayText)
      })
    : asString(selection.text)
  if (!selectedText) return null

  return {
    surface,
    target: {
      documentId: asOptionalString(target.documentId),
      widgetId: asOptionalString(target.widgetId),
      sidebarNodeId: asOptionalString(target.sidebarNodeId),
      sidebarNodeType: isOneOf(target.sidebarNodeType, SIDEBAR_NODE_TYPES) ? target.sidebarNodeType : undefined,
      sidebarLabel: asOptionalString(target.sidebarLabel)
    },
    selection: {
      text: selectedText,
      kind: selectionKind,
      anchorFrom: asOptionalNumber(selection.anchorFrom),
      anchorTo: asOptionalNumber(selection.anchorTo),
      startOffset: asOptionalNumber(selection.startOffset),
      endOffset: asOptionalNumber(selection.endOffset),
      startPath: asOptionalString(selection.startPath),
      endPath: asOptionalString(selection.endPath),
      mathNodeId: asOptionalString(selection.mathNodeId),
      mathMode: selection.mathMode === 'inline' || selection.mathMode === 'block' ? selection.mathMode : undefined,
      mathSelectionLatex: asOptionalString(selection.mathSelectionLatex),
      mathAnchorLatex: asOptionalString(selection.mathAnchorLatex) ?? asOptionalString(selection.mathSelectionLatex),
      mathDisplayText: asOptionalString(selection.mathDisplayText),
      mathPromptText: asOptionalString(selection.mathPromptText) ?? getMathPromptText({ text: selectedText, kind: selectionKind }),
      mathSelectionPath: asOptionalString(selection.mathSelectionPath),
      mathSelectionFrom: asOptionalNumber(selection.mathSelectionFrom),
      mathSelectionTo: asOptionalNumber(selection.mathSelectionTo),
      mathAnchorVersion: selection.mathAnchorVersion === 'mathlive-v1' ? 'mathlive-v1' : undefined,
      widgetContentPath: asOptionalString(selection.widgetContentPath),
      contextPrefix: asOptionalString(selection.contextPrefix),
      contextSuffix: asOptionalString(selection.contextSuffix),
      surfaceText: asOptionalString(selection.surfaceText),
      anchorQuote: asOptionalString(selection.anchorQuote),
      preferredMarkerType: selection.preferredMarkerType === 'bracket' ? 'bracket' : selection.preferredMarkerType === 'underline' ? 'underline' : undefined
    },
    contextMode: isOneOf(raw.contextMode, CONTEXT_MODES) ? raw.contextMode : undefined,
    templateId: asOptionalString(raw.templateId),
    customPrompt: asOptionalString(raw.customPrompt),
    learningPrompt: asOptionalString(raw.learningPrompt),
    surfaceTitle: asOptionalString(raw.surfaceTitle),
    sourceQaRecordId: asOptionalString(raw.sourceQaRecordId),
    menuPoint: { x: asNumber(isObject(raw.menuPoint) ? raw.menuPoint.x : undefined, 0), y: asNumber(isObject(raw.menuPoint) ? raw.menuPoint.y : undefined, 0) }
  }
}

function normalizeReadingContextMode(rawMode: unknown, rawSnapshot: unknown, sourceSurface: QARecord['sourceSurface']): ReadingContextMode {
  if (isOneOf(rawMode, CONTEXT_MODES)) return rawMode
  if (isObject(rawSnapshot) && isOneOf(rawSnapshot.mode, CONTEXT_MODES)) return rawSnapshot.mode
  if (sourceSurface === 'widget') return 'widget-local'
  if (sourceSurface === 'sidebar') return 'sidebar-node'
  return 'section'
}
