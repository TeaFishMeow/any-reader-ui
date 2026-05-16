import type { AppConfig, EmbeddedAnchor, PromptTemplate, QARecord, ReadingContextMode } from '../../domain'
import { CURRENT_SELECTOR_VERSION, buildAnchorFingerprint, buildFullPrompt, inferPromptIntent } from '../app-helpers'
import { MAIN_CANVAS_ID } from '../defaults'
import { getMathDisplayText, getMathPromptText } from '../math-selection'
import { createId, hashString } from '../text'
import {
  asBoolean,
  asNumber,
  asOptionalBoolean,
  asOptionalNumber,
  asOptionalString,
  asString,
  isObject,
  isOneOf
} from './coerce'

const SURFACE_TYPES = ['reader', 'widget', 'sidebar'] as const
const SIDEBAR_NODE_TYPES = ['repo', 'folder', 'document'] as const
const CONTEXT_MODES = ['paragraph', 'section', 'directory', 'viewport-range', 'manual-selection', 'widget-local', 'sidebar-node'] as const
const PROMPT_INTENTS = ['symbol_meaning', 'step_justification', 'theorem_mapping', 'intuition', 'summary', 'compare', 'custom'] as const
const ANSWER_STATUSES = ['pending', 'streaming', 'done', 'error', 'aborted'] as const
const MARKER_TYPES = ['underline', 'bracket', 'none'] as const
const SELECTED_TEXT_KINDS = ['plain', 'math', 'node-label', 'ai-generated', 'mixed'] as const

export function normalizeQaRecord(raw: unknown, config: AppConfig): QARecord | null {
  if (!isObject(raw)) return null

  const sourceSurface = normalizeSurface(raw.sourceSurface, raw.anchor)
  const sourceDocumentId = asOptionalString(raw.sourceDocumentId)
  const sourceWidgetId = asOptionalString(raw.sourceWidgetId)
  const sourceSidebarNodeId = asOptionalString(raw.sourceSidebarNodeId)
  const rawSelectedText = asString(raw.selectedText) || (isObject(raw.anchor) ? asString(raw.anchor.quote) : '') || asString(raw.questionText)
  const selectedTextKind = isOneOf(raw.selectedTextKind, SELECTED_TEXT_KINDS) ? raw.selectedTextKind : undefined
  const customPromptBody = asOptionalString(raw.customPromptBody)
  const promptTemplateId = asOptionalString(raw.promptTemplateId)
  const template = promptTemplateId ? config.templates.find((candidate) => candidate.id === promptTemplateId) ?? null : null
  const promptIntent = isOneOf(raw.promptIntent, PROMPT_INTENTS) ? raw.promptIntent : inferPromptIntent(template, customPromptBody)
  const readingContextMode = normalizeReadingContextMode(raw.readingContextMode, raw.readingContextSnapshot, sourceSurface)
  const readingContextSnapshot = normalizeReadingContextSnapshot(raw.readingContextSnapshot)
  const questionText = asString(raw.questionText) || customPromptBody || resolveTemplateBody(promptTemplateId, config.templates) || extractQuestionText(raw.fullPrompt)
  const systemStatePrompt = asString(raw.systemStatePrompt)
  const anchor = normalizeAnchor(raw.anchor, { sourceSurface, sourceDocumentId, sourceWidgetId, sourceSidebarNodeId, selectedText: rawSelectedText })
  if (!anchor) return null

  const selectedText =
    selectedTextKind === 'math'
      ? getMathDisplayText({
          text: rawSelectedText,
          kind: selectedTextKind,
          mathSelectionLatex: anchor.mathSelectionLatex,
          mathAnchorLatex: anchor.mathAnchorLatex,
          mathDisplayText: anchor.mathDisplayText
        }) || rawSelectedText
      : rawSelectedText

  return {
    id: asString(raw.id, createId('qa')),
    sourceSurface,
    sourceDocumentId,
    sourceWidgetId,
    sourceSidebarNodeId,
    anchor,
    parentQaRecordId: asOptionalString(raw.parentQaRecordId),
    rootQaRecordId: asOptionalString(raw.rootQaRecordId),
    selectedText,
    selectedTextKind,
    promptTemplateId,
    promptIntent,
    customPromptTitle: asOptionalString(raw.customPromptTitle),
    customPromptBody,
    systemStatePrompt,
    readingContextMode,
    readingContextSnapshot,
    fullPrompt:
      asString(raw.fullPrompt) ||
      buildFullPrompt({
        systemStatePrompt,
        contextMode: readingContextMode,
        contextSnapshot: readingContextSnapshot,
        questionText,
        selectedText,
        promptSelectionText: selectedTextKind === 'math' ? getMathPromptText({ text: selectedText, kind: selectedTextKind, mathSelectionLatex: anchor.mathSelectionLatex, mathAnchorLatex: anchor.mathAnchorLatex, mathPromptText: anchor.mathPromptText }) || undefined : undefined
      }),
    questionText,
    answerMarkdown: asString(raw.answerMarkdown),
    answerStatus: isOneOf(raw.answerStatus, ANSWER_STATUSES) ? raw.answerStatus : asString(raw.answerMarkdown) ? 'done' : questionText ? 'pending' : 'aborted',
    modelInfo: normalizeModelInfo(raw.modelInfo),
    timing: normalizeTiming(raw.timing),
    visualStyle: normalizeVisualStyle(raw.visualStyle),
    lifecycle: normalizeLifecycle(raw.lifecycle),
    createdAt: asString(raw.createdAt, new Date().toISOString()),
    updatedAt: asString(raw.updatedAt, new Date().toISOString())
  }
}

function normalizeReadingContextMode(rawMode: unknown, rawSnapshot: unknown, sourceSurface: QARecord['sourceSurface']): ReadingContextMode {
  if (isOneOf(rawMode, CONTEXT_MODES)) return rawMode
  if (isObject(rawSnapshot) && isOneOf(rawSnapshot.mode, CONTEXT_MODES)) return rawSnapshot.mode
  if (sourceSurface === 'widget') return 'widget-local'
  if (sourceSurface === 'sidebar') return 'sidebar-node'
  return 'section'
}

function normalizeReadingContextSnapshot(rawSnapshot: unknown) {
  if (typeof rawSnapshot === 'string') return rawSnapshot
  return isObject(rawSnapshot) ? asString(rawSnapshot.textSnapshot) : ''
}

function normalizeAnchor(
  raw: unknown,
  context: {
    sourceSurface: QARecord['sourceSurface']
    sourceDocumentId?: string
    sourceWidgetId?: string
    sourceSidebarNodeId?: string
    selectedText: string
  }
): EmbeddedAnchor | null {
  const source = isObject(raw) ? raw : {}
  const target = normalizeAnchorTarget(source.target, context)
  if (!target) return null

  const anchorFrom = asOptionalNumber(source.anchorFrom)
  const anchorTo = asOptionalNumber(source.anchorTo)
  const startOffset = asOptionalNumber(source.startOffset)
  const endOffset = asOptionalNumber(source.endOffset)
  const quote = asOptionalString(source.quote) ?? (context.selectedText || undefined)
  const quoteHash = asOptionalString(source.quoteHash) ?? hashString(quote ?? context.selectedText)
  const mathSelectionLatex = asOptionalString(source.mathSelectionLatex)
  const mathAnchorLatex = asOptionalString(source.mathAnchorLatex) ?? mathSelectionLatex
  const hasMathAnchor = Boolean(asOptionalString(source.mathNodeId) || mathSelectionLatex || mathAnchorLatex || asOptionalString(source.mathDisplayText))
  const mathDisplayText = asOptionalString(source.mathDisplayText) ?? (hasMathAnchor ? getMathDisplayText({ text: quote ?? context.selectedText, kind: 'math', mathSelectionLatex, mathAnchorLatex }) || undefined : undefined)
  const mathPromptText = asOptionalString(source.mathPromptText) ?? (hasMathAnchor ? getMathPromptText({ text: quote ?? context.selectedText, kind: 'math', mathSelectionLatex, mathAnchorLatex }) || undefined : undefined)

  return {
    id: asString(source.id, createId('anchor')),
    target,
    quote,
    quoteHash,
    anchorFrom,
    anchorTo,
    startOffset,
    endOffset,
    startPath: asOptionalString(source.startPath),
    endPath: asOptionalString(source.endPath),
    mathNodeId: asOptionalString(source.mathNodeId),
    mathMode: source.mathMode === 'inline' || source.mathMode === 'block' ? source.mathMode : undefined,
    mathSelectionLatex,
    mathAnchorLatex,
    mathDisplayText,
    mathPromptText,
    mathSelectionPath: asOptionalString(source.mathSelectionPath),
    mathSelectionFrom: asOptionalNumber(source.mathSelectionFrom),
    mathSelectionTo: asOptionalNumber(source.mathSelectionTo),
    mathAnchorVersion: source.mathAnchorVersion === 'mathlive-v1' ? 'mathlive-v1' : undefined,
    contextPrefix: asOptionalString(source.contextPrefix),
    contextSuffix: asOptionalString(source.contextSuffix),
    isRange: asBoolean(source.isRange, startOffset !== endOffset),
    anchorFingerprint: asString(source.anchorFingerprint, buildAnchorFingerprint({
      target,
      selectedText: asOptionalString(source.mathNodeId) && asOptionalString(source.mathSelectionPath) ? mathDisplayText ?? context.selectedText : context.selectedText,
      quoteHash,
      anchorFrom,
      anchorTo,
      startOffset,
      endOffset,
      startPath: asOptionalString(source.startPath),
      endPath: asOptionalString(source.endPath),
      mathNodeId: asOptionalString(source.mathNodeId),
      mathSelectionPath: asOptionalString(source.mathSelectionPath)
    })),
    selectorVersion: asString(source.selectorVersion, CURRENT_SELECTOR_VERSION)
  }
}

function normalizeAnchorTarget(raw: unknown, context: { sourceSurface: QARecord['sourceSurface']; sourceDocumentId?: string; sourceWidgetId?: string; sourceSidebarNodeId?: string }): EmbeddedAnchor['target'] | null {
  const source = isObject(raw) ? raw : {}
  const surface = normalizeSurface(source.surface, null, context.sourceSurface)
  if (surface === 'reader') {
    const documentId = asString(source.documentId, context.sourceDocumentId ?? '')
    return documentId ? { surface: 'reader', documentId, blockId: asOptionalString(source.blockId) } : null
  }
  if (surface === 'widget') {
    const widgetId = asOptionalString(source.widgetId) ?? context.sourceWidgetId
    const sourceQaRecordId = asOptionalString(source.sourceQaRecordId)
    return widgetId || sourceQaRecordId
      ? { surface: 'widget', canvasId: asString(source.canvasId, MAIN_CANVAS_ID), widgetId: widgetId ?? `qa-record:${sourceQaRecordId}`, sourceQaRecordId, widgetContentPath: asOptionalString(source.widgetContentPath) }
      : null
  }
  return {
    surface: 'sidebar',
    repoId: asString(source.repoId, 'local-repo'),
    nodeId: asString(source.nodeId, context.sourceSidebarNodeId ?? 'local-repo'),
    nodeType: isOneOf(source.nodeType, SIDEBAR_NODE_TYPES) ? source.nodeType : 'document'
  }
}

function normalizeModelInfo(raw: unknown) {
  if (!isObject(raw)) return undefined
  const provider = asOptionalString(raw.provider)
  const model = asOptionalString(raw.model)
  return provider && model
    ? {
        provider,
        displayName: asOptionalString(raw.displayName),
        model,
        temperature: asOptionalNumber(raw.temperature),
        modelId: asOptionalString(raw.modelId),
        cost: asOptionalNumber(raw.cost),
        remainingCredits: asOptionalNumber(raw.remainingCredits)
      }
    : undefined
}

function normalizeTiming(raw: unknown) {
  const source = isObject(raw) ? raw : {}
  return {
    requestedAt: asString(source.requestedAt, new Date().toISOString()),
    firstTokenAt: asOptionalString(source.firstTokenAt),
    completedAt: asOptionalString(source.completedAt),
    durationMs: asOptionalNumber(source.durationMs)
  }
}

function normalizeVisualStyle(raw: unknown) {
  const source = isObject(raw) ? raw : {}
  return {
    color: asString(source.color, '#5f4b32'),
    markerType: isOneOf(source.markerType, MARKER_TYPES) ? source.markerType : 'underline',
    isMergedEntry: asOptionalBoolean(source.isMergedEntry)
  }
}

function normalizeLifecycle(raw: unknown) {
  const source = isObject(raw) ? raw : {}
  return {
    isDeleted: asBoolean(source.isDeleted, false),
    deletedAt: asOptionalString(source.deletedAt)
  }
}

function normalizeSurface(rawSurface: unknown, rawAnchor: unknown, fallback: QARecord['sourceSurface'] = 'reader'): QARecord['sourceSurface'] {
  if (isOneOf(rawSurface, SURFACE_TYPES)) return rawSurface
  return isObject(rawAnchor) && isObject(rawAnchor.target) && isOneOf(rawAnchor.target.surface, SURFACE_TYPES) ? rawAnchor.target.surface : fallback
}

function resolveTemplateBody(promptTemplateId: string | undefined, templates: PromptTemplate[]) {
  return templates.find((template) => template.id === promptTemplateId)?.body ?? ''
}

function extractQuestionText(fullPrompt: unknown) {
  return asString(fullPrompt).match(/提问：\s*([\s\S]*?)\n\s*被选中的文本：/)?.[1]?.trim() ?? ''
}
