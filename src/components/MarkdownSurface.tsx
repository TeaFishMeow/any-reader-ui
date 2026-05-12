import { useEffect, useMemo, useRef, useState, type CSSProperties, type MutableRefObject } from 'react'
import { createPortal } from 'react-dom'
import 'mathlive/static.css'
import 'mathlive/fonts.css'
import { EditorContent, useEditor, type Editor } from '@tiptap/react'
import type { EditorView } from '@tiptap/pm/view'
import {
  buildRichTextExtensions,
  findEnclosingSemanticBlockPath,
  refreshAnnotationDecorations,
  type AnnotationHoverState,
  type AnnotationLayout,
  type MathSelectionDebugEvent,
  type MathSelectionSnapshot
} from '../lib/rich-text-extensions'
import {
  buildDocumentLookup,
  isExternalUrl,
  renderBlocksToRichTextHtml,
  renderMarkdownToRichTextHtml,
  resolveLinkedDocumentId,
  type RichTextBlock
} from '../lib/rich-text-markdown'
import { collectNativeSelectionBridgeNodePositions } from '../lib/native-selection-bridge'
import { getQaRecordAnswerPreviewText, useQaRecordElapsedLabel } from '../lib/qa-record-preview'
import { useI18n } from '../i18n/useI18n'
import type { AppConfig, AskSelection, DocumentNode, QARecord } from '../types/domain'

export interface MarkdownSurfaceBlock extends RichTextBlock {}

interface MarkdownSurfaceProps {
  markdown: string
  qaRecords: QARecord[]
  config: AppConfig
  surface: 'reader' | 'widget'
  fontScope?: 'reader' | 'widget'
  documentId?: string
  documentPath?: string
  documents?: DocumentNode[]
  mountedVaultPath?: string
  remoteLibraryId?: string
  remoteRevisionId?: string
  widgetId?: string
  surfaceTitle: string
  sourceQaRecordId?: string
  semanticBlocks?: MarkdownSurfaceBlock[]
  allowAsk?: boolean
  showAnnotations?: boolean
  onAsk: (selection: AskSelection) => void
  onOpenRecord: (recordId: string) => void
  onOpenGroup: (recordIds: string[], point: { x: number; y: number }) => void
  onOpenDocument?: (documentId: string) => void
  onDebugMathSelectionEvent?: (event: MathSelectionDebugEvent) => void
}

interface HoveredAnnotationDetails {
  point: { x: number; y: number }
  layout: AnnotationLayout
}

interface SelectionSnapshot {
  from: number
  to: number
  text: string
  kind?: AskSelection['selection']['kind']
  surfaceText: string
  startOffset: number
  endOffset: number
  menuPoint: { x: number; y: number }
  widgetContentPath?: string
  mathNodeId?: string
  mathMode?: 'inline' | 'block'
  mathSelectionLatex?: string
  mathAnchorLatex?: string
  mathDisplayText?: string
  mathPromptText?: string
  mathSelectionPath?: string
  mathSelectionFrom?: number
  mathSelectionTo?: number
  mathAnchorVersion?: 'mathlive-v1'
}

const NATIVE_SELECTION_BRIDGE_CLASS = 'is-native-selected'
const NATIVE_SELECTION_BRIDGE_SELECTOR = '.rich-text-math, .rich-text-image-wrap, .markdown-image-missing'

export function MarkdownSurface({
  markdown,
  qaRecords,
  config,
  surface,
  fontScope,
  documentId,
  documentPath,
  documents,
  mountedVaultPath,
  remoteLibraryId,
  remoteRevisionId,
  widgetId,
  surfaceTitle,
  sourceQaRecordId,
  semanticBlocks,
  allowAsk = true,
  showAnnotations = true,
  onAsk,
  onOpenRecord,
  onOpenGroup,
  onOpenDocument,
  onDebugMathSelectionEvent
}: MarkdownSurfaceProps) {
  const { t } = useI18n()
  const surfaceRef = useRef<HTMLDivElement | null>(null)
  const layoutsRef = useRef<AnnotationLayout[]>([])
  const hoveredKeyRef = useRef<string | null>(null)
  const documentLookupRef = useRef(buildDocumentLookup(documents ?? []))
  const onOpenRecordRef = useRef(onOpenRecord)
  const onOpenGroupRef = useRef(onOpenGroup)
  const onOpenDocumentRef = useRef(onOpenDocument)
  const onDebugMathSelectionEventRef = useRef(onDebugMathSelectionEvent)
  const htmlContentRef = useRef('')
  const editorRef = useRef<Editor | null>(null)
  const selectionRafRef = useRef<number | null>(null)
  const mathSelectionRef = useRef<MathSelectionSnapshot | null>(null)
  const annotationListenersRef = useRef(new Set<() => void>())
  const askContextRef = useRef({
    allowAsk,
    config,
    documentId,
    onAsk,
    sourceQaRecordId,
    surface,
    surfaceTitle,
    widgetId
  })
  const selectionInteractionRef = useRef({
    isPointerDown: false,
    suppressAsk: false
  })
  const selectionActiveRef = useRef(false)
  const mathSelectionActiveRef = useRef(false)
  const [hoveredAnnotationState, setHoveredAnnotationState] = useState<AnnotationHoverState | null>(null)
  const documentLookup = useMemo(() => buildDocumentLookup(documents ?? []), [documents])
  const htmlContent = useMemo(
    () =>
      semanticBlocks && semanticBlocks.length > 0
        ? renderBlocksToRichTextHtml(semanticBlocks)
        : renderMarkdownToRichTextHtml(markdown, documentPath ?? surfaceTitle),
    [documentPath, markdown, semanticBlocks, surfaceTitle]
  )
  const visibleLayouts = useMemo(
    () =>
      showAnnotations
        ? buildAnnotationLayouts({
            qaRecords,
            surface,
            documentId,
            widgetId,
            sourceQaRecordId
          })
        : [],
    [documentId, qaRecords, showAnnotations, sourceQaRecordId, surface, widgetId]
  )
  const surfaceStyle = useMemo(
    () =>
      ({
        '--content-font-size': `${
          (fontScope ?? (surface === 'widget' ? 'widget' : 'reader')) === 'widget'
            ? config.rendering.widgetFontPx
            : config.rendering.readerFontPx
        }px`
      }) as CSSProperties,
    [config.rendering.readerFontPx, config.rendering.widgetFontPx, fontScope, surface]
  )
  const hoveredAnnotation = useMemo(
    () => resolveHoveredAnnotation(hoveredAnnotationState, visibleLayouts),
    [hoveredAnnotationState, visibleLayouts]
  )
  const hoveredPreviewRecord = useMemo(() => {
    const primaryRecordId = hoveredAnnotation?.layout.recordIds[0]
    return primaryRecordId ? qaRecords.find((record) => record.id === primaryRecordId) ?? null : null
  }, [hoveredAnnotation, qaRecords])
  const hoveredElapsedLabel = useQaRecordElapsedLabel(hoveredPreviewRecord)
  const hoveredPreviewText = hoveredPreviewRecord
    ? getQaRecordAnswerPreviewText(hoveredPreviewRecord, hoveredElapsedLabel, 220, {
        answerPending: t('canvas.label.answerPending')
      })
    : ''
  const tooltipBody = typeof document === 'undefined' ? null : document.body

  layoutsRef.current = visibleLayouts
  hoveredKeyRef.current = hoveredAnnotationState?.key ?? null
  documentLookupRef.current = documentLookup
  onOpenRecordRef.current = onOpenRecord
  onOpenGroupRef.current = onOpenGroup
  onOpenDocumentRef.current = onOpenDocument
  onDebugMathSelectionEventRef.current = onDebugMathSelectionEvent
  askContextRef.current = {
    allowAsk,
    config,
    documentId,
    onAsk,
    sourceQaRecordId,
    surface,
    surfaceTitle,
    widgetId
  }

  const commitMathSelection = (next: MathSelectionSnapshot | null) => {
    const currentAskContext = askContextRef.current
    if (!next || !currentAskContext.allowAsk) {
      return
    }

    const currentEditor = editorRef.current
    const surfaceRoot = surfaceRef.current
    if (!currentEditor || !surfaceRoot) {
      return
    }

    mathSelectionRef.current = next
    mathSelectionActiveRef.current = true
    selectionInteractionRef.current.isPointerDown = false
    selectionInteractionRef.current.suppressAsk = false
    cancelScheduledSelection(selectionRafRef)

    const fullText = currentEditor.state.doc.textBetween(0, currentEditor.state.doc.content.size, '\n\n')
    const snapshot = buildSelectionSnapshotFromMathSelection({
      editor: currentEditor,
      fullText,
      surface: currentAskContext.surface,
      mathSelection: next
    })
    if (!snapshot) {
      return
    }

    emitAskFromSelectionSnapshot({
      snapshot,
      surface: currentAskContext.surface,
      documentId: currentAskContext.documentId,
      widgetId: currentAskContext.widgetId,
      surfaceTitle: currentAskContext.surfaceTitle,
      sourceQaRecordId: currentAskContext.sourceQaRecordId,
      onAsk: currentAskContext.onAsk,
      config: currentAskContext.config
    })
  }

  const annotationController = useMemo(
    () =>
      showAnnotations
        ? {
            getLayouts: () => layoutsRef.current,
            getHoveredKey: () => hoveredKeyRef.current,
            isInteractionBlocked: () =>
              selectionActiveRef.current || mathSelectionActiveRef.current || selectionInteractionRef.current.isPointerDown,
            onHoverChange: (next: AnnotationHoverState | null) => {
              if (
                selectionActiveRef.current ||
                mathSelectionActiveRef.current ||
                selectionInteractionRef.current.isPointerDown
              ) {
                setHoveredAnnotationState(null)
                return
              }

              setHoveredAnnotationState(next)
            },
            onActivate: (recordIds: string[], point: { x: number; y: number }) => {
              if (recordIds.length === 1) {
                onOpenRecordRef.current(recordIds[0])
              } else {
                onOpenGroupRef.current(recordIds, point)
              }
            },
            subscribe: (listener: () => void) => {
              annotationListenersRef.current.add(listener)
              return () => {
                annotationListenersRef.current.delete(listener)
              }
            }
          }
        : undefined,
    [showAnnotations]
  )

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: false,
      extensions: buildRichTextExtensions({
        documentPath,
        mountedVaultPath,
        remoteLibraryId,
        remoteRevisionId,
        annotationController,
        mathSelectionController: {
          onSelectionChange: (next) => {
            mathSelectionRef.current = next
            mathSelectionActiveRef.current = Boolean(next)
            if (next) {
              setHoveredAnnotationState(null)
            }
          },
          onSelectionCommit: (next) => {
            commitMathSelection(next)
          },
          onDebugEvent: (event) => {
            onDebugMathSelectionEventRef.current?.(event)
          }
        }
      }),
      content: htmlContent,
      editorProps: {
        attributes: {
          class: 'surface-content markdown-body rich-text-surface'
        },
        handleClick: (_view, _pos, event) => {
          const linkElement = event.target instanceof HTMLElement ? event.target.closest<HTMLAnchorElement>('a[href]') : null
          if (!linkElement) {
            return false
          }

          const href = linkElement.getAttribute('href') ?? ''
          const resolvedDocumentId = resolveLinkedDocumentId(href, documentLookupRef.current, documentPath)
          if (resolvedDocumentId && onOpenDocumentRef.current) {
            event.preventDefault()
            onOpenDocumentRef.current(resolvedDocumentId)
            return true
          }

          if (isExternalUrl(href)) {
            event.preventDefault()
            window.open(href, '_blank', 'noopener,noreferrer')
            return true
          }

          return false
        }
      }
    },
    [annotationController, documentPath, mountedVaultPath, remoteLibraryId, remoteRevisionId]
  )
  editorRef.current = editor

  useEffect(() => {
    if (!editor) {
      return
    }

    if (htmlContentRef.current !== htmlContent) {
      editor.commands.setContent(htmlContent, {
        emitUpdate: false
      })
      htmlContentRef.current = htmlContent
    }
  }, [editor, htmlContent])

  useEffect(() => {
    if (editor) {
      htmlContentRef.current = htmlContent
    }
  }, [editor, htmlContent])

  useEffect(() => {
    refreshAnnotationDecorations(editor)
    annotationListenersRef.current.forEach((listener) => listener())
  }, [editor, hoveredAnnotationState?.key, visibleLayouts])

  useEffect(() => {
    const root = surfaceRef.current
    if (!root) {
      return
    }

    const hoveredKey = hoveredAnnotationState?.key ?? null
    const syncHoveredClass = (selector: string) => {
      root.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        element.classList.toggle('is-hovered', Boolean(hoveredKey) && element.dataset.annotationKey === hoveredKey)
      })
    }

    syncHoveredClass('.qa-bracket-widget')
    syncHoveredClass('.qa-math-selection-overlay')
  }, [hoveredAnnotationState?.key, visibleLayouts])

  useEffect(() => {
    const handleSelectionChange = () => {
      const nativeSelectionRange = resolveNativeSelectionRangeInEditor({
        editor,
        surfaceRoot: surfaceRef.current
      })
      selectionActiveRef.current = Boolean(nativeSelectionRange)
      syncNativeSelectionBridge({
        editor,
        surfaceRoot: surfaceRef.current,
        selectionRange: nativeSelectionRange
      })
      if (nativeSelectionRange) {
        setHoveredAnnotationState(null)
      }
    }

    handleSelectionChange()
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      clearNativeSelectionBridge(surfaceRef.current)
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [editor])

  useEffect(() => {
    return () => {
      cancelScheduledSelection(selectionRafRef)
    }
  }, [])

  useEffect(() => {
    const root = surfaceRef.current
    if (!root) {
      return
    }

    const resolveTargetElement = (target: EventTarget | null) => {
      if (target instanceof HTMLElement) {
        return target
      }
      if (target instanceof Text) {
        return target.parentElement
      }
      return null
    }

    const resetPointerInteraction = () => {
      selectionInteractionRef.current.isPointerDown = false
      selectionInteractionRef.current.suppressAsk = false
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.contains(event.target)) {
        return
      }

      const targetElement = resolveTargetElement(event.target)
      const isMathMarkerInteraction = Boolean(targetElement?.closest('math-field') && targetElement.closest('[data-annotation-key]'))
      selectionInteractionRef.current.isPointerDown = true
      selectionInteractionRef.current.suppressAsk = Boolean(targetElement?.closest('[data-no-selection-menu="true"]'))
      if (!targetElement?.closest('math-field') || isMathMarkerInteraction) {
        mathSelectionRef.current = null
        mathSelectionActiveRef.current = false
      }
      cancelScheduledSelection(selectionRafRef)
      setHoveredAnnotationState(null)
    }

    const handlePointerUp = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !root.contains(event.target)) {
        return
      }

      const targetElement = resolveTargetElement(event.target)
      const shouldSuppress = selectionInteractionRef.current.suppressAsk
      resetPointerInteraction()

      if (event.button !== 0 || !allowAsk || shouldSuppress || targetElement?.closest('math-field')) {
        return
      }

      scheduleSelectionCommit({
        selectionRafRef,
        mathSelectionRef,
        editor,
        surfaceRoot: surfaceRef.current,
        surface,
        documentId,
        widgetId,
        surfaceTitle,
        sourceQaRecordId,
        onAsk,
        config
      })
    }

    const handleContextMenu = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !root.contains(event.target) || !allowAsk) {
        return
      }

      const targetElement = resolveTargetElement(event.target)
      if (targetElement?.closest('[data-no-selection-menu="true"]') || targetElement?.closest('math-field')) {
        return
      }

      const currentSnapshot = buildSelectionSnapshotFromSurfaceSelection({
        editor,
        surfaceRoot: surfaceRef.current,
        surface,
        config,
        mathSelectionRef
      })
      if (!currentSnapshot) {
        return
      }

      event.preventDefault()
      resetPointerInteraction()
      setHoveredAnnotationState(null)
      scheduleSelectionCommit({
        selectionRafRef,
        mathSelectionRef,
        editor,
        surfaceRoot: surfaceRef.current,
        surface,
        documentId,
        widgetId,
        surfaceTitle,
        sourceQaRecordId,
        onAsk,
        config,
        menuPointOverride: {
          x: event.clientX + 8,
          y: event.clientY + 8
        }
      })
    }

    const handlePointerCancel = () => {
      resetPointerInteraction()
      cancelScheduledSelection(selectionRafRef)
    }

    const handleWindowPointerUp = (event: PointerEvent) => {
      if (event.target instanceof Node && root.contains(event.target)) {
        return
      }

      resetPointerInteraction()
    }

    root.addEventListener('pointerdown', handlePointerDown, true)
    root.addEventListener('pointerup', handlePointerUp, true)
    root.addEventListener('pointercancel', handlePointerCancel, true)
    root.addEventListener('contextmenu', handleContextMenu, true)
    window.addEventListener('pointerup', handleWindowPointerUp, true)
    window.addEventListener('pointercancel', handleWindowPointerUp, true)

    return () => {
      root.removeEventListener('pointerdown', handlePointerDown, true)
      root.removeEventListener('pointerup', handlePointerUp, true)
      root.removeEventListener('pointercancel', handlePointerCancel, true)
      root.removeEventListener('contextmenu', handleContextMenu, true)
      window.removeEventListener('pointerup', handleWindowPointerUp, true)
      window.removeEventListener('pointercancel', handleWindowPointerUp, true)
    }
  }, [allowAsk, config, documentId, editor, onAsk, sourceQaRecordId, surface, surfaceTitle, widgetId])

  return (
    <div ref={surfaceRef} className="surface-root" style={surfaceStyle}>
      <EditorContent editor={editor} />
      {hoveredAnnotation &&
      hoveredPreviewText &&
      !selectionActiveRef.current &&
      !mathSelectionActiveRef.current &&
      tooltipBody
        ? createPortal(
            <div
              className="marker-tooltip"
              style={{
                position: 'fixed',
                left: hoveredAnnotation.point.x,
                top: hoveredAnnotation.point.y + 8,
                transform: 'translateX(-50%)'
              }}
            >
              <div className="marker-tooltip-answer">{hoveredPreviewText}</div>
            </div>,
            tooltipBody
          )
        : null}
    </div>
  )
}

function scheduleSelectionCommit(args: {
  selectionRafRef: MutableRefObject<number | null>
  mathSelectionRef: MutableRefObject<MathSelectionSnapshot | null>
  editor: Editor | null
  surfaceRoot: HTMLDivElement | null
  surface: 'reader' | 'widget'
  documentId?: string
  widgetId?: string
  surfaceTitle: string
  sourceQaRecordId?: string
  onAsk: (selection: AskSelection) => void
  config: AppConfig
  menuPointOverride?: { x: number; y: number }
}) {
  cancelScheduledSelection(args.selectionRafRef)
  args.selectionRafRef.current = window.requestAnimationFrame(() => {
    args.selectionRafRef.current = window.requestAnimationFrame(() => {
      args.selectionRafRef.current = null
      const snapshot = buildSelectionSnapshotFromSurfaceSelection({
        editor: args.editor,
        surfaceRoot: args.surfaceRoot,
        surface: args.surface,
        config: args.config,
        mathSelectionRef: args.mathSelectionRef
      })
      if (!snapshot) {
        return
      }

      const resolvedSnapshot = args.menuPointOverride
        ? {
            ...snapshot,
            menuPoint: args.menuPointOverride
          }
        : snapshot

      emitAskFromSelectionSnapshot({
        snapshot: resolvedSnapshot,
        surface: args.surface,
        documentId: args.documentId,
        widgetId: args.widgetId,
        surfaceTitle: args.surfaceTitle,
        sourceQaRecordId: args.sourceQaRecordId,
        onAsk: args.onAsk,
        config: args.config
      })
    })
  })
}

function emitAskFromSelectionSnapshot(args: {
  snapshot: SelectionSnapshot
  surface: 'reader' | 'widget'
  documentId?: string
  widgetId?: string
  surfaceTitle: string
  sourceQaRecordId?: string
  onAsk: (selection: AskSelection) => void
  config: AppConfig
}) {
  args.onAsk({
    surface: args.surface,
    target: {
      documentId: args.documentId,
      widgetId: args.widgetId
    },
    selection: {
      text: args.snapshot.text,
      kind: args.snapshot.kind,
      startOffset: args.snapshot.startOffset,
      endOffset: args.snapshot.endOffset,
      mathNodeId: args.snapshot.mathNodeId,
      mathMode: args.snapshot.mathMode,
      mathSelectionLatex: args.snapshot.mathSelectionLatex,
      mathAnchorLatex: args.snapshot.mathAnchorLatex,
      mathDisplayText: args.snapshot.mathDisplayText,
      mathPromptText: args.snapshot.mathPromptText,
      mathSelectionPath: args.snapshot.mathSelectionPath,
      mathSelectionFrom: args.snapshot.mathSelectionFrom,
      mathSelectionTo: args.snapshot.mathSelectionTo,
      mathAnchorVersion: args.snapshot.mathAnchorVersion,
      widgetContentPath: args.snapshot.widgetContentPath,
      contextPrefix:
        args.snapshot.kind === 'math'
          ? ''
          : args.snapshot.surfaceText.slice(Math.max(0, args.snapshot.startOffset - 80), args.snapshot.startOffset),
      contextSuffix:
        args.snapshot.kind === 'math'
          ? ''
          : args.snapshot.surfaceText.slice(
              args.snapshot.endOffset,
              Math.min(args.snapshot.surfaceText.length, args.snapshot.endOffset + 80)
            ),
      surfaceText: args.snapshot.surfaceText,
      anchorQuote: args.snapshot.text,
      preferredMarkerType:
        args.snapshot.text.length > args.config.rendering.shortSelectionCharThreshold ? 'bracket' : 'underline',
      anchorFrom: args.snapshot.from,
      anchorTo: args.snapshot.to
    },
    surfaceTitle: args.surfaceTitle,
    sourceQaRecordId: args.sourceQaRecordId,
    menuPoint: args.snapshot.menuPoint
  })
}

function cancelScheduledSelection(selectionRafRef: MutableRefObject<number | null>) {
  if (selectionRafRef.current !== null) {
    window.cancelAnimationFrame(selectionRafRef.current)
    selectionRafRef.current = null
  }
}

function buildSelectionSnapshotFromSurfaceSelection(args: {
  editor: Editor | null
  surfaceRoot: HTMLElement | null
  surface: 'reader' | 'widget'
  config: AppConfig
  mathSelectionRef: MutableRefObject<MathSelectionSnapshot | null>
}): SelectionSnapshot | null {
  const { editor, surfaceRoot, surface } = args
  if (!editor || !surfaceRoot) {
    return null
  }

  const fullText = editor.state.doc.textBetween(0, editor.state.doc.content.size, '\n\n')
  const nativeSnapshot = buildSelectionSnapshotFromNativeSelection({ editor, fullText, surface, surfaceRoot })
  if (nativeSnapshot) {
    return nativeSnapshot
  }

  return buildSelectionSnapshotFromMathSelection({
    editor,
    fullText,
    surface,
    mathSelection: args.mathSelectionRef.current
  })
}

function buildSelectionSnapshotFromNativeSelection(args: {
  editor: Editor
  surfaceRoot: HTMLElement
  surface: 'reader' | 'widget'
  fullText: string
}): SelectionSnapshot | null {
  const nativeSelectionRange = resolveNativeSelectionRangeInEditor({
    editor: args.editor,
    surfaceRoot: args.surfaceRoot
  })
  if (!nativeSelectionRange) {
    return null
  }

  const { from: normalizedFrom, to: normalizedTo, range } = nativeSelectionRange
  const selectedText = args.editor.state.doc.textBetween(normalizedFrom, normalizedTo, '\n\n')
  if (!selectedText.trim()) {
    return null
  }

  const startOffset = args.editor.state.doc.textBetween(0, normalizedFrom, '\n\n').length
  const endOffset = args.editor.state.doc.textBetween(0, normalizedTo, '\n\n').length
  const fromBlockPath = args.surface === 'widget' ? findEnclosingSemanticBlockPath(args.editor.state.doc, normalizedFrom) : undefined
  const toBlockPath = args.surface === 'widget' ? findEnclosingSemanticBlockPath(args.editor.state.doc, normalizedTo) : undefined
  const rect = resolveSelectionRect(range)

  return {
    from: normalizedFrom,
    to: normalizedTo,
    text: selectedText,
    surfaceText: args.fullText,
    startOffset,
    endOffset,
    widgetContentPath: fromBlockPath && fromBlockPath === toBlockPath ? fromBlockPath : undefined,
    menuPoint: {
      x: rect.right + 8,
      y: rect.bottom + 8
    }
  }
}

function buildSelectionSnapshotFromMathSelection(args: {
  editor: Editor
  fullText: string
  surface: 'reader' | 'widget'
  mathSelection: MathSelectionSnapshot | null
}): SelectionSnapshot | null {
  if (!args.mathSelection) {
    return null
  }

  const from = Math.min(args.mathSelection.anchorFrom, args.mathSelection.anchorTo)
  const to = Math.max(args.mathSelection.anchorFrom, args.mathSelection.anchorTo)
  if (from === to) {
    return null
  }

  const startOffset = args.editor.state.doc.textBetween(0, from, '\n\n').length
  const endOffset = args.editor.state.doc.textBetween(0, to, '\n\n').length
  const fromBlockPath = args.surface === 'widget' ? findEnclosingSemanticBlockPath(args.editor.state.doc, from) : undefined
  const toBlockPath = args.surface === 'widget' ? findEnclosingSemanticBlockPath(args.editor.state.doc, to) : undefined

  return {
    from,
    to,
    text: args.mathSelection.text,
    kind: 'math',
    surfaceText: args.fullText,
    startOffset,
    endOffset,
    widgetContentPath: fromBlockPath && fromBlockPath === toBlockPath ? fromBlockPath : undefined,
    mathNodeId: args.mathSelection.mathNodeId,
    mathMode: args.mathSelection.mathMode,
    mathSelectionLatex: args.mathSelection.mathSelectionLatex,
    mathAnchorLatex: args.mathSelection.mathAnchorLatex,
    mathDisplayText: args.mathSelection.mathDisplayText,
    mathPromptText: args.mathSelection.mathPromptText,
    mathSelectionPath: args.mathSelection.mathSelectionPath,
    mathSelectionFrom: args.mathSelection.mathSelectionFrom,
    mathSelectionTo: args.mathSelection.mathSelectionTo,
    mathAnchorVersion: args.mathSelection.mathAnchorVersion,
    menuPoint: args.mathSelection.menuPoint
  }
}

function resolveDomBoundaryToPos(view: EditorView, container: Node, offset: number, bias: -1 | 1): number | null {
  let currentNode: Node | null = container
  let currentOffset = offset

  while (currentNode) {
    try {
      return view.posAtDOM(currentNode, currentOffset, bias)
    } catch {
      const parent: Node | null = currentNode.parentNode
      if (!parent) {
        return null
      }

      currentOffset = resolveChildIndex(parent, currentNode) + (bias > 0 ? 1 : 0)
      currentNode = parent
    }
  }

  return null
}

function resolveChildIndex(parent: Node, child: Node) {
  const childNodes = Array.from(parent.childNodes) as Node[]
  const index = childNodes.indexOf(child)
  return index >= 0 ? index : 0
}

function containsNode(root: HTMLElement, node: Node | null) {
  return Boolean(node && root.contains(node instanceof Text ? node.parentElement : node))
}

function resolveNativeSelectionRangeInEditor(args: { editor: Editor | null; surfaceRoot: HTMLElement | null }) {
  const { editor, surfaceRoot } = args
  if (!editor || !surfaceRoot) {
    return null
  }

  const nativeSelection = window.getSelection()
  if (!nativeSelection || nativeSelection.rangeCount === 0 || nativeSelection.isCollapsed) {
    return null
  }

  const range = nativeSelection.getRangeAt(0)
  if (!containsNode(surfaceRoot, range.startContainer) || !containsNode(surfaceRoot, range.endContainer)) {
    return null
  }

  const from = resolveDomBoundaryToPos(editor.view, range.startContainer, range.startOffset, -1)
  const to = resolveDomBoundaryToPos(editor.view, range.endContainer, range.endOffset, 1)
  if (from === null || to === null || from === to) {
    return null
  }

  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
    range
  }
}

function syncNativeSelectionBridge(args: {
  editor: Editor | null
  surfaceRoot: HTMLElement | null
  selectionRange: { from: number; to: number } | null
}) {
  if (!args.surfaceRoot) {
    return
  }

  if (!args.editor || !args.selectionRange) {
    clearNativeSelectionBridge(args.surfaceRoot)
    return
  }

  const selectedElements = new Set<HTMLElement>()
  for (const pos of collectNativeSelectionBridgeNodePositions(
    args.editor.state.doc,
    args.selectionRange.from,
    args.selectionRange.to
  )) {
    const element = resolveNativeSelectionBridgeElement(args.editor.view.nodeDOM(pos))
    if (element) {
      selectedElements.add(element)
    }
  }

  args.surfaceRoot.querySelectorAll<HTMLElement>(NATIVE_SELECTION_BRIDGE_SELECTOR).forEach((element) => {
    element.classList.toggle(NATIVE_SELECTION_BRIDGE_CLASS, selectedElements.has(element))
  })
}

function clearNativeSelectionBridge(surfaceRoot: HTMLElement | null) {
  surfaceRoot?.querySelectorAll<HTMLElement>(NATIVE_SELECTION_BRIDGE_SELECTOR).forEach((element) => {
    element.classList.remove(NATIVE_SELECTION_BRIDGE_CLASS)
  })
}

function resolveNativeSelectionBridgeElement(node: Node | null) {
  if (!(node instanceof HTMLElement)) {
    return null
  }

  return node.closest<HTMLElement>(NATIVE_SELECTION_BRIDGE_SELECTOR)
}

function resolveSelectionRect(range: Range) {
  const rects = [...range.getClientRects()].filter((rect) => rect.width > 0 || rect.height > 0)
  if (rects.length > 0) {
    return rects[rects.length - 1]
  }

  return range.getBoundingClientRect()
}

function buildAnnotationLayouts(args: {
  qaRecords: QARecord[]
  surface: 'reader' | 'widget'
  documentId?: string
  widgetId?: string
  sourceQaRecordId?: string
}) {
  const { qaRecords, surface, documentId, sourceQaRecordId, widgetId } = args
  const grouped = new Map<string, QARecord[]>()

  for (const record of qaRecords) {
    if (record.lifecycle.isDeleted || record.answerStatus === 'aborted') {
      continue
    }

    const target = record.anchor.target
    const isVisible =
      surface === 'reader'
        ? target.surface === 'reader' && target.documentId === documentId
        : target.surface === 'widget' &&
          (sourceQaRecordId ? target.sourceQaRecordId === sourceQaRecordId : target.widgetId === widgetId)
    if (!isVisible) {
      continue
    }

    const key = record.anchor.anchorFingerprint
    grouped.set(key, [...(grouped.get(key) ?? []), record])
  }

  return [...grouped.entries()]
    .map(([key, records]) => {
      const ordered = [...records].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      // Same-fingerprint records collapse to one visible entry; the newest record supplies the entry color and marker.
      const primary = ordered[0]
      const from = primary.anchor.anchorFrom
      const to = primary.anchor.anchorTo
      const mathNodeId = primary.anchor.mathNodeId
      if ((from === undefined || to === undefined || from >= to) && !mathNodeId) {
        return null
      }

      return {
        key,
        recordIds: ordered.map((record) => record.id),
        color: primary.visualStyle.color,
        markerType: primary.visualStyle.markerType === 'bracket' ? 'bracket' : 'underline',
        from,
        to,
        mathNodeId,
        mathMode: primary.anchor.mathMode,
        mathSelectionLatex: primary.anchor.mathSelectionLatex,
        mathSelectionPath: primary.anchor.mathSelectionPath,
        mathSelectionFrom: primary.anchor.mathSelectionFrom,
        mathSelectionTo: primary.anchor.mathSelectionTo
      } satisfies AnnotationLayout
    })
    .filter(Boolean) as AnnotationLayout[]
}

function resolveHoveredAnnotation(next: AnnotationHoverState | null, layouts: AnnotationLayout[]) {
  if (!next) {
    return null
  }

  const layout = layouts.find((candidate) => candidate.key === next.key)
  if (!layout) {
    return null
  }

  return {
    point: next.point,
    layout
  }
}
