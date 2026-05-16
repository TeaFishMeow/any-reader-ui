import type { AppConfig, PromptTemplate } from '../../domain'
import { applyPromptTemplateDefaults, defaultAppConfig } from '../defaults'
import { createId } from '../text'
import {
  asBoolean,
  asNumber,
  asOptionalString,
  asString,
  asStringArray,
  isObject,
  isOneOf,
  type JsonRecord
} from './coerce'

const DEFAULT_CONTEXT_MODES = ['paragraph', 'section', 'directory', 'viewport-range'] as const
const REPOSITORY_SOURCE_MODES = ['demo', 'mounted-vault', 'remote-library'] as const
const STORAGE_MODES = ['local-first-files', 'remote-api'] as const
const TEMPLATE_SCOPES = ['global', 'repo', 'document-type'] as const

export function normalizeConfig(raw: unknown): AppConfig {
  const defaults = defaultAppConfig()
  const source = isObject(raw) ? raw : {}
  const layout = isObject(source.layout) ? source.layout : {}
  const rendering = isObject(source.rendering) ? source.rendering : {}
  const leftSidebarMinWidth = Math.max(160, asNumber(layout.leftSidebarMinWidth, defaults.layout.leftSidebarMinWidth))
  const rightSidebarMinWidth = Math.max(160, asNumber(layout.rightSidebarMinWidth, defaults.layout.rightSidebarMinWidth))
  const legacyContentFontPx = Math.max(12, Math.min(28, asNumber(rendering.contentFontPx, defaults.rendering.readerFontPx)))

  return {
    layout: {
      leftSidebarCollapsed: asBoolean(layout.leftSidebarCollapsed, defaults.layout.leftSidebarCollapsed),
      rightSidebarCollapsed: asBoolean(layout.rightSidebarCollapsed, defaults.layout.rightSidebarCollapsed),
      leftSidebarWidth: Math.max(leftSidebarMinWidth, asNumber(layout.leftSidebarWidth, defaults.layout.leftSidebarWidth)),
      rightSidebarWidth: Math.max(rightSidebarMinWidth, asNumber(layout.rightSidebarWidth, defaults.layout.rightSidebarWidth)),
      leftSidebarMinWidth,
      rightSidebarMinWidth,
      collapsedRailWidth: Math.max(28, asNumber(layout.collapsedRailWidth, defaults.layout.collapsedRailWidth)),
      rememberLayout: asBoolean(layout.rememberLayout, defaults.layout.rememberLayout)
    },
    askMenu: {
      maxVisibleTemplates: asNumber(isObject(source.askMenu) ? source.askMenu.maxVisibleTemplates : undefined, defaults.askMenu.maxVisibleTemplates)
    },
    navigation: normalizeNavigation(source.navigation),
    context: normalizeContext(source.context, defaults),
    rendering: {
      readerFontPx: Math.max(12, Math.min(28, asNumber(rendering.readerFontPx, legacyContentFontPx))),
      widgetFontPx: Math.max(12, Math.min(28, asNumber(rendering.widgetFontPx, legacyContentFontPx))),
      shortSelectionCharThreshold: asNumber(rendering.shortSelectionCharThreshold, defaults.rendering.shortSelectionCharThreshold)
    },
    storage: normalizeStorage(source.storage, defaults),
    shortcuts: normalizeShortcuts(source.shortcuts, defaults),
    learning: normalizeLearningConfig(isObject(source.learning) ? source.learning : {}, defaults),
    provider: normalizeProvider(source.provider, defaults),
    repository: normalizeRepository(source.repository, defaults),
    templates: normalizeTemplates(source.templates, defaults.templates)
  }
}

function normalizeNavigation(raw: unknown): AppConfig['navigation'] {
  const source = isObject(raw) ? raw : {}
  return {
    collapsedSidebarFolderIds: [...new Set(asStringArray(source.collapsedSidebarFolderIds))],
    readerScrollPositions: Object.fromEntries(
      Object.entries(isObject(source.readerScrollPositions) ? source.readerScrollPositions : {}).flatMap(([path, scrollTop]) =>
        path && typeof scrollTop === 'number' && Number.isFinite(scrollTop)
          ? [[path, Math.max(0, Math.round(scrollTop))]]
          : []
      )
    )
  }
}

function normalizeContext(raw: unknown, defaults: AppConfig): AppConfig['context'] {
  const source = isObject(raw) ? raw : {}
  return {
    defaultMode: isOneOf(source.defaultMode, DEFAULT_CONTEXT_MODES) ? source.defaultMode : defaults.context.defaultMode,
    viewportRangeBlocks: asNumber(source.viewportRangeBlocks, defaults.context.viewportRangeBlocks),
    widgetDefaultMode: 'widget-local'
  }
}

function normalizeStorage(raw: unknown, defaults: AppConfig): AppConfig['storage'] {
  const source = isObject(raw) ? raw : {}
  return {
    mode: isOneOf(source.mode, STORAGE_MODES) ? source.mode : defaults.storage.mode,
    autoSaveMs: asNumber(source.autoSaveMs, defaults.storage.autoSaveMs)
  }
}

function normalizeShortcuts(raw: unknown, defaults: AppConfig): AppConfig['shortcuts'] {
  const source = isObject(raw) ? raw : {}
  return {
    toggleLeft: asString(source.toggleLeft, defaults.shortcuts.toggleLeft),
    toggleRight: asString(source.toggleRight, defaults.shortcuts.toggleRight),
    openContext: asString(source.openContext, defaults.shortcuts.openContext)
  }
}

function normalizeProvider(raw: unknown, defaults: AppConfig): AppConfig['provider'] {
  const source = isObject(raw) ? raw : {}
  return {
    baseUrl: asString(source.baseUrl, defaults.provider.baseUrl),
    apiKey: asString(source.apiKey, defaults.provider.apiKey),
    model: asString(source.model, defaults.provider.model),
    temperature: asNumber(source.temperature, defaults.provider.temperature)
  }
}

function normalizeRepository(raw: unknown, defaults: AppConfig): AppConfig['repository'] {
  const source = isObject(raw) ? raw : {}
  return {
    sourceMode: isOneOf(source.sourceMode, REPOSITORY_SOURCE_MODES) ? source.sourceMode : defaults.repository.sourceMode,
    libraryId: asOptionalString(source.libraryId) ?? defaults.repository.libraryId,
    revisionId: asOptionalString(source.revisionId) ?? defaults.repository.revisionId,
    mountedVaultPath: asOptionalString(source.mountedVaultPath) ?? defaults.repository.mountedVaultPath,
    lastOpenedDocumentPath: asOptionalString(source.lastOpenedDocumentPath) ?? defaults.repository.lastOpenedDocumentPath
  }
}

function normalizeLearningConfig(raw: JsonRecord, defaults: AppConfig) {
  const directPrompt = asString(raw.prompt)
  if (directPrompt) return { prompt: directPrompt }

  const legacyStates = Array.isArray(raw.states)
    ? raw.states
        .map((state) => {
          const source = isObject(state) ? state : {}
          const id = asString(source.id)
          const prompt = asString(source.prompt)
          return id || prompt ? { id, prompt } : null
        })
        .filter((state): state is { id: string; prompt: string } => Boolean(state))
    : []
  const currentStateId = asString(raw.currentStateId)
  return {
    prompt: legacyStates.find((state) => state.id === currentStateId)?.prompt ?? legacyStates[0]?.prompt ?? defaults.learning.prompt
  }
}

function normalizeTemplates(raw: unknown, defaults: PromptTemplate[]) {
  const source = Array.isArray(raw) ? raw : defaults
  return applyPromptTemplateDefaults(source.map((template, index) => {
    const draft = isObject(template) ? template : {}
    const fallback = defaults[index] ?? defaults[defaults.length - 1]
    return {
      id: asString(draft.id, fallback?.id ?? createId('template')),
      title: asString(draft.title, fallback?.title ?? `模板 ${index + 1}`),
      body: asString(draft.body, fallback?.body ?? ''),
      color: asString(draft.color, fallback?.color ?? '#4a5568'),
      order: asNumber(draft.order, index),
      isBuiltIn: asBoolean(draft.isBuiltIn, fallback?.isBuiltIn ?? false),
      isEnabled: asBoolean(draft.isEnabled, fallback?.isEnabled ?? true),
      scope: isOneOf(draft.scope, TEMPLATE_SCOPES) ? draft.scope : fallback?.scope ?? 'global'
    }
  }))
}
